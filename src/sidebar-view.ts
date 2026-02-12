import { App, ItemView, WorkspaceLeaf } from "obsidian";
import {
    PluginSettings,
    TaskSummary,
    SummaryPeriod,
    VIEW_TYPE_DAILY_SUMMARY,
    WorkLogEntry,
} from "./types";
import {
    formatDuration,
    getTodayDailyNote,
    parseLogEntries,
    parsePlanEntries,
    getWorkLogsForDateRange,
} from "./parser";

export class DailySummaryView extends ItemView {
    private settings: PluginSettings;
    private currentPeriod: SummaryPeriod = "today";

    constructor(leaf: WorkspaceLeaf, settings: PluginSettings) {
        super(leaf);
        this.settings = settings;
    }

    getViewType(): string {
        return VIEW_TYPE_DAILY_SUMMARY;
    }

    getDisplayText(): string {
        return "Kozane Journal 集計";
    }

    getIcon(): string {
        return "clock";
    }

    updateSettings(settings: PluginSettings): void {
        this.settings = settings;
    }

    async onOpen(): Promise<void> {
        await this.refresh();
    }

    async refresh(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();

        // Tab bar
        const tabBar = container.createDiv({ cls: "kozane-tab-bar" });
        const tabs: { id: SummaryPeriod; label: string }[] = [
            { id: "today", label: "今日" },
            { id: "this-week", label: "今週" },
            { id: "last-week", label: "先週" },
            { id: "this-month", label: "今月" },
            { id: "last-month", label: "先月" },
        ];

        for (const tab of tabs) {
            const btn = tabBar.createEl("button", {
                text: tab.label,
                cls: `kozane-tab ${this.currentPeriod === tab.id ? "is-active" : ""}`,
            });
            btn.addEventListener("click", () => {
                this.currentPeriod = tab.id;
                this.refresh();
            });
        }

        const content = container.createDiv({ cls: "kozane-sidebar-content" });

        if (this.currentPeriod === "today") {
            await this.renderTodaySummary(content);
        } else {
            await this.renderPeriodSummary(content, this.currentPeriod);
        }
    }

    private async renderTodaySummary(container: HTMLElement): Promise<void> {
        const dailyFile = getTodayDailyNote(this.app, this.settings);

        if (!dailyFile) {
            container.createEl("p", {
                text: "今日の日次ノートがありません",
                cls: "kozane-no-data",
            });
            return;
        }

        const fileContent = await this.app.vault.cachedRead(dailyFile);
        const today = window.moment().format(this.settings.dailyNoteFormat);

        const planEntries = parsePlanEntries(fileContent, this.settings);
        const logEntries = parseLogEntries(fileContent, today, this.settings);

        const totalPlannedMinutes = planEntries.reduce((sum, e) => sum + e.plannedMinutes, 0);
        const totalLoggedMinutes = logEntries.reduce((sum, e) => sum + e.durationMinutes, 0);
        const plannedTaskNames = new Set(planEntries.map((e) => e.taskName));
        const matchedLoggedMinutes = logEntries
            .filter((e) => plannedTaskNames.has(e.taskName))
            .reduce((sum, e) => sum + e.durationMinutes, 0);
        const remainingMinutes = Math.max(0, totalPlannedMinutes - matchedLoggedMinutes);

        // Progress section
        const progressSection = container.createDiv({ cls: "kozane-progress" });
        progressSection.createEl("h3", { text: "【今日の作業時間】" });

        const progressInfo = progressSection.createDiv({ cls: "kozane-progress-info" });

        this.addInfoRow(progressInfo, "予定総時間", formatDuration(totalPlannedMinutes));
        this.addInfoRow(progressInfo, "実績時間", formatDuration(totalLoggedMinutes));
        this.addInfoRow(progressInfo, "残り時間", formatDuration(remainingMinutes));

        // Predicted end time
        if (totalPlannedMinutes > 0 && remainingMinutes > 0) {
            let predictedEnd = "";
            if (logEntries.length > 0) {
                const sorted = [...logEntries].sort((a, b) =>
                    b.endTime.localeCompare(a.endTime)
                );
                const [h, m] = sorted[0].endTime.split(":").map(Number);
                const endMinutes = h * 60 + m + remainingMinutes;
                const endH = Math.floor(endMinutes / 60) % 24;
                const endM = endMinutes % 60;
                predictedEnd = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
            } else {
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                const endMinutes = currentMinutes + remainingMinutes;
                const endH = Math.floor(endMinutes / 60) % 24;
                const endM = endMinutes % 60;
                predictedEnd = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
            }
            this.addInfoRow(progressInfo, "⏰ 予定終了", predictedEnd);
        }

        // Task summary
        this.renderTaskSummary(container, logEntries, "タスク別集計");
    }

    private async renderPeriodSummary(
        container: HTMLElement,
        period: SummaryPeriod
    ): Promise<void> {
        const { startDate, endDate, label } = this.getDateRange(period);

        const header = container.createEl("h3", { text: `【${label}の作業時間】` });
        container.createEl("p", {
            text: `${startDate} 〜 ${endDate}`,
            cls: "kozane-date-range",
        });

        const entries = await getWorkLogsForDateRange(
            this.app,
            startDate,
            endDate,
            this.settings
        );

        if (entries.length === 0) {
            container.createEl("p", {
                text: "作業記録がありません",
                cls: "kozane-no-data",
            });
            return;
        }

        const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
        const workDays = new Set(entries.map((e) => e.date));
        const avgMinutes = workDays.size > 0 ? Math.round(totalMinutes / workDays.size) : 0;

        this.renderTaskSummaryWithDays(container, entries, "タスク別集計");

        const summaryDiv = container.createDiv({ cls: "kozane-period-summary" });
        summaryDiv.createEl("hr");
        this.addInfoRow(summaryDiv, "総作業時間", formatDuration(totalMinutes));
        this.addInfoRow(summaryDiv, "1日平均", formatDuration(avgMinutes));
    }

    private renderTaskSummary(
        container: HTMLElement,
        entries: WorkLogEntry[],
        title: string
    ): void {
        const summaryMap = this.buildTaskSummaryMap(entries);

        const section = container.createDiv({ cls: "kozane-task-summary" });
        section.createEl("h4", { text: title });
        section.createEl("hr");

        const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

        for (const [taskName, summary] of summaryMap) {
            const taskDiv = section.createDiv({ cls: "kozane-task-item" });
            taskDiv.createEl("div", { text: taskName, cls: "kozane-task-name" });
            taskDiv.createEl("div", {
                text: `  ${summary.sessionCount}回 / ${formatDuration(summary.totalMinutes)}`,
                cls: "kozane-task-detail",
            });
        }

        section.createEl("hr");
        this.addInfoRow(section, "総作業時間", formatDuration(totalMinutes));
    }

    private renderTaskSummaryWithDays(
        container: HTMLElement,
        entries: WorkLogEntry[],
        title: string
    ): void {
        const summaryMap = this.buildTaskSummaryMap(entries);

        const section = container.createDiv({ cls: "kozane-task-summary" });
        section.createEl("h4", { text: title });
        section.createEl("hr");

        for (const [taskName, summary] of summaryMap) {
            const taskDiv = section.createDiv({ cls: "kozane-task-item" });
            taskDiv.createEl("div", { text: taskName, cls: "kozane-task-name" });
            taskDiv.createEl("div", {
                text: `  作業日数: ${summary.workDays.size}日 / ${formatDuration(summary.totalMinutes)}`,
                cls: "kozane-task-detail",
            });
        }
    }

    private buildTaskSummaryMap(entries: WorkLogEntry[]): Map<string, TaskSummary> {
        const map = new Map<string, TaskSummary>();

        for (const entry of entries) {
            const existing = map.get(entry.taskName);
            if (existing) {
                existing.totalMinutes += entry.durationMinutes;
                existing.sessionCount += 1;
                existing.workDays.add(entry.date);
            } else {
                map.set(entry.taskName, {
                    taskName: entry.taskName,
                    totalMinutes: entry.durationMinutes,
                    sessionCount: 1,
                    workDays: new Set([entry.date]),
                });
            }
        }

        // Sort by total minutes descending
        return new Map(
            [...map.entries()].sort((a, b) => b[1].totalMinutes - a[1].totalMinutes)
        );
    }

    private addInfoRow(container: HTMLElement, label: string, value: string): void {
        const row = container.createDiv({ cls: "kozane-info-row" });
        row.createEl("span", { text: label, cls: "kozane-info-label" });
        row.createEl("span", { text: value, cls: "kozane-info-value" });
    }

    private getDateRange(period: SummaryPeriod): {
        startDate: string;
        endDate: string;
        label: string;
    } {
        const m = window.moment();
        const fmt = this.settings.dailyNoteFormat;

        switch (period) {
            case "this-week":
                return {
                    startDate: m.clone().startOf("isoWeek").format(fmt),
                    endDate: m.clone().endOf("isoWeek").format(fmt),
                    label: "今週",
                };
            case "last-week":
                return {
                    startDate: m.clone().subtract(1, "week").startOf("isoWeek").format(fmt),
                    endDate: m.clone().subtract(1, "week").endOf("isoWeek").format(fmt),
                    label: "先週",
                };
            case "this-month":
                return {
                    startDate: m.clone().startOf("month").format(fmt),
                    endDate: m.clone().endOf("month").format(fmt),
                    label: "今月",
                };
            case "last-month":
                return {
                    startDate: m.clone().subtract(1, "month").startOf("month").format(fmt),
                    endDate: m.clone().subtract(1, "month").endOf("month").format(fmt),
                    label: "先月",
                };
            default:
                return {
                    startDate: m.format(fmt),
                    endDate: m.format(fmt),
                    label: "今日",
                };
        }
    }
}
