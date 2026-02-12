import { App, TFile } from "obsidian";
import { PluginSettings, WorkLogEntry, PlanEntry } from "./types";

/**
 * Parse LOG section entries from a daily note's content.
 */
export function parseLogEntries(content: string, date: string, settings: PluginSettings): WorkLogEntry[] {
    const lines = content.split("\n");
    const sectionHeader = `## ${settings.logSectionName}`;
    let inLogSection = false;
    const entries: WorkLogEntry[] = [];

    for (const line of lines) {
        if (line.trim() === sectionHeader) {
            inLogSection = true;
            continue;
        }
        if (inLogSection && line.startsWith("##")) {
            break;
        }
        if (inLogSection && line.trim().startsWith("-")) {
            const entry = parseLogLine(line, date);
            if (entry) {
                entries.push(entry);
            }
        }
    }

    return entries;
}

/**
 * Parse a single LOG line into a WorkLogEntry.
 * Format: - HH:MM-HH:MM [[タスク名]] / メモ
 */
export function parseLogLine(line: string, date: string): WorkLogEntry | null {
    const timeMatch = line.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
    const taskMatch = line.match(/\[\[([^\]]+)\]\]/);

    if (!timeMatch || !taskMatch) {
        return null;
    }

    const startHour = parseInt(timeMatch[1]);
    const startMin = parseInt(timeMatch[2]);
    const endHour = parseInt(timeMatch[3]);
    const endMin = parseInt(timeMatch[4]);

    const durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);

    const noteMatch = line.match(/\]\]\s*\/\s*(.+)$/);
    const note = noteMatch ? noteMatch[1].trim() : "";

    return {
        date,
        startTime: `${timeMatch[1]}:${timeMatch[2]}`,
        endTime: `${timeMatch[3]}:${timeMatch[4]}`,
        taskName: taskMatch[1],
        note,
        durationMinutes: Math.max(0, durationMinutes),
    };
}

/**
 * Parse PLAN section entries from a daily note's content.
 */
export function parsePlanEntries(content: string, settings: PluginSettings): PlanEntry[] {
    const lines = content.split("\n");
    const sectionHeader = `## ${settings.planSectionName}`;
    let inPlanSection = false;
    const entries: PlanEntry[] = [];

    for (const line of lines) {
        if (line.trim() === sectionHeader) {
            inPlanSection = true;
            continue;
        }
        if (inPlanSection && line.startsWith("##")) {
            break;
        }
        if (inPlanSection && line.trim().startsWith("-")) {
            const entry = parsePlanLine(line);
            if (entry) {
                entries.push(entry);
            }
        }
    }

    return entries;
}

/**
 * Parse a single PLAN line into a PlanEntry.
 * Format: - [[タスク名]] / サブタスク XXmin or XXh
 */
export function parsePlanLine(line: string): PlanEntry | null {
    const taskMatch = line.match(/\[\[([^\]]+)\]\]/);
    if (!taskMatch) {
        return null;
    }

    let plannedMinutes = 0;
    const hourMatch = line.match(/(\d+(?:\.\d+)?)h\b/);
    const minMatch = line.match(/(\d+)min/);
    if (hourMatch) {
        plannedMinutes = Math.round(parseFloat(hourMatch[1]) * 60);
    } else if (minMatch) {
        plannedMinutes = parseInt(minMatch[1]);
    }

    const noteMatch = line.match(/\]\]\s*\/\s*(.+?)(?:\s+\d+(?:\.\d+)?h|\s+\d+min)?$/);
    const subTask = noteMatch ? noteMatch[1].trim() : "";

    return {
        taskName: taskMatch[1],
        subTask,
        plannedMinutes,
    };
}

/**
 * Get all work log entries for a specific task from all daily notes.
 */
export async function getTaskWorkLogs(
    app: App,
    taskName: string,
    settings: PluginSettings
): Promise<WorkLogEntry[]> {
    const dailyFolder = settings.dailyFolder;
    const allFiles = app.vault.getFiles();
    const dailyFiles = allFiles.filter(
        (f) => f.path.startsWith(dailyFolder + "/") && f.extension === "md"
    );

    const allEntries: WorkLogEntry[] = [];

    for (const file of dailyFiles) {
        const date = file.basename;
        const content = await app.vault.cachedRead(file);
        const entries = parseLogEntries(content, date, settings);
        for (const entry of entries) {
            if (entry.taskName === taskName) {
                allEntries.push(entry);
            }
        }
    }

    // Sort by date descending, then by start time descending
    allEntries.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.startTime.localeCompare(a.startTime);
    });

    return allEntries;
}

/**
 * Get all work log entries for a given date range from daily notes.
 */
export async function getWorkLogsForDateRange(
    app: App,
    startDate: string,
    endDate: string,
    settings: PluginSettings
): Promise<WorkLogEntry[]> {
    const dailyFolder = settings.dailyFolder;
    const allFiles = app.vault.getFiles();
    const dailyFiles = allFiles.filter((f) => {
        if (!f.path.startsWith(dailyFolder + "/") || f.extension !== "md") {
            return false;
        }
        const date = f.basename;
        return date >= startDate && date <= endDate;
    });

    const allEntries: WorkLogEntry[] = [];

    for (const file of dailyFiles) {
        const date = file.basename;
        const content = await app.vault.cachedRead(file);
        const entries = parseLogEntries(content, date, settings);
        allEntries.push(...entries);
    }

    return allEntries;
}

/**
 * Get today's daily note file, or null if it doesn't exist.
 */
export function getTodayDailyNote(app: App, settings: PluginSettings): TFile | null {
    const today = window.moment().format(settings.dailyNoteFormat);
    return getDailyNoteByDate(app, today, settings);
}

/**
 * Get a daily note file by date string, or null if it doesn't exist.
 */
export function getDailyNoteByDate(app: App, dateStr: string, settings: PluginSettings): TFile | null {
    const path = `${settings.dailyFolder}/${dateStr}.md`;
    const file = app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
}

/**
 * Format duration in minutes to a human-readable Japanese string.
 */
export function formatDuration(totalMinutes: number): string {
    if (totalMinutes < 0) {
        return `${formatDuration(Math.abs(totalMinutes))}超過`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours === 0) {
        return `${mins}分`;
    }
    if (mins === 0) {
        return `${hours}時間`;
    }
    return `${hours}時間${mins}分`;
}

/**
 * Round a Date to the nearest N minutes.
 * Rounds to the nearest interval: <30 seconds rounds down, >=30 seconds rounds up within the interval.
 */
export function roundTime(date: Date, roundingMinutes: number): Date {
    const ms = date.getTime();
    const roundingMs = roundingMinutes * 60 * 1000;
    const rounded = Math.round(ms / roundingMs) * roundingMs;
    return new Date(rounded);
}

/**
 * Format a Date to HH:MM string.
 */
export function formatTime(date: Date): string {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
}
