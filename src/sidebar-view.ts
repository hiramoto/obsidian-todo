import { App, ItemView, WorkspaceLeaf } from "obsidian";
import {
    PluginSettings,
    TaskSummary,
    SummaryTab,
    VIEW_TYPE_DAILY_SUMMARY,
    WorkLogEntry,
} from "./types";
import {
    adjustForLunchBreak,
    formatDuration,
    getTodayDailyNote,
    minutesToTimeStr,
    parseLogEntries,
    parsePlanEntries,
    parseTimeToMinutes,
    getWorkLogsForDateRange,
} from "./parser";

export class DailySummaryView extends ItemView {
    private settings: PluginSettings;
    private currentTab: SummaryTab = "date-select";
    private selectedDate: string;
    private periodStartDate: string;
    private periodEndDate: string;

    constructor(leaf: WorkspaceLeaf, settings: PluginSettings) {
        super(leaf);
        this.settings = settings;

        const m = window.moment();
        const fmt = this.settings.dailyNoteFormat;
        this.selectedDate = m.format(fmt);
        this.periodStartDate = m.clone().startOf("month").format(fmt);
        this.periodEndDate = m.clone().endOf("month").format(fmt);
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

        const fmt = this.settings.dailyNoteFormat;

        // Main tab bar: 日付選択 | 期間選択
        const tabBar = container.createDiv({ cls: "kozane-tab-bar" });
        const tabs: { id: SummaryTab; label: string }[] = [
            { id: "date-select", label: "日付選択" },
            { id: "period-select", label: "期間選択" },
        ];

        for (const tab of tabs) {
            const btn = tabBar.createEl("button", {
                text: tab.label,
                cls: `kozane-tab ${this.currentTab === tab.id ? "is-active" : ""}`,
            });
            btn.addEventListener("click", () => {
                this.currentTab = tab.id;
                this.refresh();
            });
        }

        const content = container.createDiv({ cls: "kozane-sidebar-content" });

        if (this.currentTab === "date-select") {
            await this.renderDateSelectTab(content);
        } else {
            await this.renderPeriodSelectTab(content);
        }
    }

    private async renderDateSelectTab(container: HTMLElement): Promise<void> {
        const fmt = this.settings.dailyNoteFormat;
        const today = window.moment().format(fmt);

        // Controls section
        const controls = container.createDiv({ cls: "kozane-date-controls" });

        // "今日" quick button
        const todayBtn = controls.createEl("button", {
            text: "今日",
            cls: `kozane-today-btn ${this.selectedDate === today ? "is-active" : ""}`,
        });
        todayBtn.addEventListener("click", () => {
            this.selectedDate = today;
            this.refresh();
        });

        // Date input
        const dateInput = controls.createEl("input", {
            type: "date",
            cls: "kozane-date-input",
        });
        dateInput.value = window.moment(this.selectedDate, fmt).format("YYYY-MM-DD");
        dateInput.addEventListener("change", () => {
            if (dateInput.value) {
                this.selectedDate = window.moment(dateInput.value, "YYYY-MM-DD").format(fmt);
                this.refresh();
            }
        });

        // Render the summary for the selected date
        const isToday = this.selectedDate === today;
        if (isToday) {
            await this.renderTodaySummary(container);
        } else {
            await this.renderSingleDateSummary(container, this.selectedDate);
        }
    }

    private async renderPeriodSelectTab(container: HTMLElement): Promise<void> {
        const fmt = this.settings.dailyNoteFormat;
        const m = window.moment();

        // Quick period buttons
        const quickButtons = container.createDiv({ cls: "kozane-quick-periods" });
        const periods = [
            { label: "今週", start: m.clone().startOf("isoWeek").format(fmt), end: m.clone().endOf("isoWeek").format(fmt) },
            { label: "先週", start: m.clone().subtract(1, "week").startOf("isoWeek").format(fmt), end: m.clone().subtract(1, "week").endOf("isoWeek").format(fmt) },
            { label: "今月", start: m.clone().startOf("month").format(fmt), end: m.clone().endOf("month").format(fmt) },
            { label: "先月", start: m.clone().subtract(1, "month").startOf("month").format(fmt), end: m.clone().subtract(1, "month").endOf("month").format(fmt) },
        ];

        for (const period of periods) {
            const isActive = this.periodStartDate === period.start && this.periodEndDate === period.end;
            const btn = quickButtons.createEl("button", {
                text: period.label,
                cls: `kozane-tab ${isActive ? "is-active" : ""}`,
            });
            btn.addEventListener("click", () => {
                this.periodStartDate = period.start;
                this.periodEndDate = period.end;
                this.refresh();
            });
        }

        // Date range inputs
        const rangeControls = container.createDiv({ cls: "kozane-range-controls" });

        const startGroup = rangeControls.createDiv({ cls: "kozane-range-group" });
        startGroup.createEl("label", { text: "開始日", cls: "kozane-range-label" });
        const startInput = startGroup.createEl("input", {
            type: "date",
            cls: "kozane-date-input",
        });
        startInput.value = window.moment(this.periodStartDate, fmt).format("YYYY-MM-DD");

        const endGroup = rangeControls.createDiv({ cls: "kozane-range-group" });
        endGroup.createEl("label", { text: "終了日", cls: "kozane-range-label" });
        const endInput = endGroup.createEl("input", {
            type: "date",
            cls: "kozane-date-input",
        });
        endInput.value = window.moment(this.periodEndDate, fmt).format("YYYY-MM-DD");

        startInput.addEventListener("change", () => {
            if (startInput.value) {
                this.periodStartDate = window.moment(startInput.value, "YYYY-MM-DD").format(fmt);
                this.refresh();
            }
        });

        endInput.addEventListener("change", () => {
            if (endInput.value) {
                this.periodEndDate = window.moment(endInput.value, "YYYY-MM-DD").format(fmt);
                this.refresh();
            }
        });

        // Render the period summary
        await this.renderPeriodSummary(container, this.periodStartDate, this.periodEndDate);
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

        // Predicted end time (adjusted for lunch break)
        if (totalPlannedMinutes > 0 && remainingMinutes > 0) {
            let predictedEnd = "";
            if (logEntries.length > 0) {
                const sorted = [...logEntries].sort((a, b) =>
                    b.endTime.localeCompare(a.endTime)
                );
                const startMinutes = parseTimeToMinutes(sorted[0].endTime);
                const endMinutes = adjustForLunchBreak(
                    startMinutes, remainingMinutes,
                    this.settings.lunchStartTime, this.settings.lunchEndTime
                );
                predictedEnd = minutesToTimeStr(endMinutes);
            } else {
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                const endMinutes = adjustForLunchBreak(
                    currentMinutes, remainingMinutes,
                    this.settings.lunchStartTime, this.settings.lunchEndTime
                );
                predictedEnd = minutesToTimeStr(endMinutes);
            }
            this.addInfoRow(progressInfo, "⏰ 予定終了", predictedEnd);
        }

        // Task summary
        this.renderTaskSummary(container, logEntries, "タスク別集計");
    }

    private async renderSingleDateSummary(container: HTMLElement, date: string): Promise<void> {
        const entries = await getWorkLogsForDateRange(
            this.app,
            date,
            date,
            this.settings
        );

        const displayDate = window.moment(date, this.settings.dailyNoteFormat).format("YYYY/MM/DD");
        container.createEl("h3", { text: `【${displayDate}の作業時間】` });

        if (entries.length === 0) {
            container.createEl("p", {
                text: "作業記録がありません",
                cls: "kozane-no-data",
            });
            return;
        }

        const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

        this.renderTaskSummary(container, entries, "タスク別集計");
    }

    private async renderPeriodSummary(
        container: HTMLElement,
        startDate: string,
        endDate: string
    ): Promise<void> {
        const fmt = this.settings.dailyNoteFormat;
        const displayStart = window.moment(startDate, fmt).format("YYYY/MM/DD");
        const displayEnd = window.moment(endDate, fmt).format("YYYY/MM/DD");

        container.createEl("p", {
            text: `${displayStart} 〜 ${displayEnd}`,
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
}
