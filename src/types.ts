export interface PluginSettings {
    tasksFolder: string;
    dailyFolder: string;
    planSectionName: string;
    logSectionName: string;
    dailyNoteFormat: string;
    timeRoundingMinutes: number;
    showStatusBar: boolean;
    autoShowHistory: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    tasksFolder: "5-tasks",
    dailyFolder: "2-daily",
    planSectionName: "PLAN",
    logSectionName: "LOG",
    dailyNoteFormat: "YYYY-MM-DD",
    timeRoundingMinutes: 5,
    showStatusBar: true,
    autoShowHistory: true,
};

export interface WorkLogEntry {
    date: string;
    startTime: string;
    endTime: string;
    taskName: string;
    note: string;
    durationMinutes: number;
}

export interface PlanEntry {
    taskName: string;
    subTask: string;
    plannedMinutes: number;
}

export interface ActiveWork {
    taskName: string;
    taskPath: string;
    startTime: Date;
}

export interface TaskSummary {
    taskName: string;
    totalMinutes: number;
    sessionCount: number;
    workDays: Set<string>;
}

export type SummaryTab = "date" | "period";

export const VIEW_TYPE_DAILY_SUMMARY = "kozane-journal-daily-summary";
