import { App, TFile } from "obsidian";
import { PluginSettings } from "./types";
import { formatDuration, getTodayDailyNote, parseLogEntries, parsePlanEntries } from "./parser";

/**
 * Calculate and update the status bar text showing the predicted end time.
 */
export function updateStatusBar(
    statusBarEl: HTMLElement,
    app: App,
    settings: PluginSettings
): void {
    if (!settings.showStatusBar) {
        statusBarEl.setText("");
        return;
    }

    const dailyFile = getTodayDailyNote(app, settings);
    if (!dailyFile) {
        statusBarEl.setText("📝 日次ノートなし");
        return;
    }

    // Use cachedRead for performance
    app.vault.cachedRead(dailyFile).then((content) => {
        const result = calculateSchedule(content, settings);
        statusBarEl.setText(result);
    });
}

/**
 * Calculate the schedule text from daily note content.
 */
export function calculateSchedule(content: string, settings: PluginSettings): string {
    const today = window.moment().format(settings.dailyNoteFormat);

    const planEntries = parsePlanEntries(content, settings);
    const logEntries = parseLogEntries(content, today, settings);

    // Total planned time in minutes
    const totalPlannedMinutes = planEntries.reduce((sum, e) => sum + e.plannedMinutes, 0);

    if (totalPlannedMinutes === 0) {
        return "📝 予定未設定";
    }

    // Total logged time in minutes
    const totalLoggedMinutes = logEntries.reduce((sum, e) => sum + e.durationMinutes, 0);

    // Remaining time
    const remainingMinutes = totalPlannedMinutes - totalLoggedMinutes;

    if (remainingMinutes <= 0) {
        const overMinutes = Math.abs(remainingMinutes);
        return `✅ 予定完了 (+${formatDuration(overMinutes)})`;
    }

    // Find the last log entry end time
    let lastEndTime: string | null = null;
    if (logEntries.length > 0) {
        // Sort by end time and get the latest
        const sorted = [...logEntries].sort((a, b) => b.endTime.localeCompare(a.endTime));
        lastEndTime = sorted[0].endTime;
    }

    // Calculate predicted end time
    let predictedEndTime: string;
    if (lastEndTime) {
        const [h, m] = lastEndTime.split(":").map(Number);
        const endMinutes = h * 60 + m + remainingMinutes;
        const endH = Math.floor(endMinutes / 60) % 24;
        const endM = endMinutes % 60;
        predictedEndTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
    } else {
        // No work started yet, calculate from current time
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const endMinutes = currentMinutes + remainingMinutes;
        const endH = Math.floor(endMinutes / 60) % 24;
        const endM = endMinutes % 60;
        predictedEndTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
    }

    return `⏰ 予定終了: ${predictedEndTime} (残り: ${formatDuration(remainingMinutes)})`;
}
