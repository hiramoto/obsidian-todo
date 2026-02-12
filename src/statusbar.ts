import { App, TFile } from "obsidian";
import { ActiveWork, PluginSettings } from "./types";
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

    // Total logged time in minutes (only for tasks that appear in PLAN)
    const plannedTaskNames = new Set(planEntries.map((e) => e.taskName));
    const matchedLoggedMinutes = logEntries
        .filter((e) => plannedTaskNames.has(e.taskName))
        .reduce((sum, e) => sum + e.durationMinutes, 0);

    // Remaining time = planned total - actual time of matched tasks
    const remainingMinutes = totalPlannedMinutes - matchedLoggedMinutes;

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

/**
 * Update the active work timer status bar element.
 * Shows task name and elapsed time (HH:mm) with a blinking clock icon.
 */
export function updateTimerBar(
    timerBarEl: HTMLElement,
    activeWork: ActiveWork | null
): void {
    timerBarEl.empty();

    if (!activeWork) {
        return;
    }

    const elapsed = Date.now() - activeWork.startTime.getTime();
    const totalMinutes = Math.floor(elapsed / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

    timerBarEl.addClass("kozane-timer-bar");

    const iconSpan = timerBarEl.createSpan({ cls: "kozane-timer-icon" });
    iconSpan.setText("\u{1F551}");

    const textSpan = timerBarEl.createSpan();
    textSpan.setText(` ${activeWork.taskName} ${timeStr}`);
}
