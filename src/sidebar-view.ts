import { App, ItemView, WorkspaceLeaf } from "obsidian";
import {
    PluginSettings,
    TaskSummary,
    SummaryTab,
    VIEW_TYPE_DAILY_SUMMARY,
    WorkLogEntry,
} from "./types";
import {
    formatDuration,
    getDailyNoteByDate,
    parseLogEntries,
    parsePlanEntries,
    getWorkLogsForDateRange,
} from "./parser";

export class DailySummaryView extends ItemView {
    private settings: PluginSettings;
    private currentTab: SummaryTab = "date";
    private selectedDate: string;
    private periodStart: string;
    private periodEnd: string;

    constructor(leaf: WorkspaceLeaf, settings: PluginSettings) {
        super(leaf);
        this.settings = settings;

        const m = window.moment();
        const fmt = this.settings.dailyNoteFormat;
        this.selectedDate = m.format(fmt);
        this.periodStart = m.clone().startOf("month").format(fmt);
        this.periodEnd = m.clone().endOf("month").format(fmt);
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
        const tabs: { id: SummaryTab; label: string }[] = [
            { id: "date", label: "日付指定" },
            { id: "period", label: "期間指定" },
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

        if (this.currentTab === "date") {
            this.renderDatePicker(content);
            await this.renderDateSummary(content);
        } else {
            this.renderPeriodPicker(content);
            await this.renderPeriodSummary(content);
        }
    }

    private renderDatePicker(container: HTMLElement): void {
        const pickerDiv = container.createDiv({ cls: "kozane-date-picker" });

        const label = pickerDiv.createEl("label", { text: "日付: " });
        const input = label.createEl("input", {
            type: "date",
            cls: "kozane-date-input",
        });
        // Convert from dailyNoteFormat to HTML date input format (YYYY-MM-DD)
        const m = window.moment(this.selectedDate, this.settings.dailyNoteFormat);
        input.value = m.format("YYYY-MM-DD");

        input.addEventListener("change", () => {
            const selected = window.moment(input.value, "YYYY-MM-DD");
            if (selected.isValid()) {
                this.selectedDate = selected.format(this.settings.dailyNoteFormat);
                this.refresh();
            }
        });
    }

    private renderPeriodPicker(container: HTMLElement): void {
        const pickerDiv = container.createDiv({ cls: "kozane-date-picker" });

        const startLabel = pickerDiv.createEl("label", { text: "開始日: " });
        const startInput = startLabel.createEl("input", {
            type: "date",
            cls: "kozane-date-input",
        });
        const startM = window.moment(this.periodStart, this.settings.dailyNoteFormat);
        startInput.value = startM.format("YYYY-MM-DD");

        const endLabel = pickerDiv.createEl("label", { text: "終了日: " });
        const endInput = endLabel.createEl("input", {
            type: "date",
            cls: "kozane-date-input",
        });
        const endM = window.moment(this.periodEnd, this.settings.dailyNoteFormat);
        endInput.value = endM.format("YYYY-MM-DD");

        startInput.addEventListener("change", () => {
            const selected = window.moment(startInput.value, "YYYY-MM-DD");
            if (selected.isValid()) {
                this.periodStart = selected.format(this.settings.dailyNoteFormat);
                this.refresh();
            }
        });

        endInput.addEventListener("change", () => {
            const selected = window.moment(endInput.value, "YYYY-MM-DD");
            if (selected.isValid()) {
                this.periodEnd = selected.format(this.settings.dailyNoteFormat);
                this.refresh();
            }
        });

        // Preset buttons
        const presetDiv = container.createDiv({ cls: "kozane-preset-buttons" });
        const presets: { label: string; getRange: () => { start: string; end: string } }[] = [
            {
                label: "今週",
                getRange: () => {
                    const m = window.moment();
                    const fmt = this.settings.dailyNoteFormat;
                    return {
                        start: m.clone().startOf("isoWeek").format(fmt),
                        end: m.clone().endOf("isoWeek").format(fmt),
                    };
                },
            },
            {
                label: "先週",
                getRange: () => {
                    const m = window.moment().subtract(1, "week");
                    const fmt = this.settings.dailyNoteFormat;
                    return {
                        start: m.clone().startOf("isoWeek").format(fmt),
                        end: m.clone().endOf("isoWeek").format(fmt),
                    };
                },
            },
            {
                label: "今月",
                getRange: () => {
                    const m = window.moment();
                    const fmt = this.settings.dailyNoteFormat;
                    return {
                        start: m.clone().startOf("month").format(fmt),
                        end: m.clone().endOf("month").format(fmt),
                    };
                },
            },
            {
                label: "先月",
                getRange: () => {
                    const m = window.moment().subtract(1, "month");
                    const fmt = this.settings.dailyNoteFormat;
                    return {
                        start: m.clone().startOf("month").format(fmt),
                        end: m.clone().endOf("month").format(fmt),
                    };
                },
            },
        ];

        for (const preset of presets) {
            const btn = presetDiv.createEl("button", {
                text: preset.label,
                cls: "kozane-preset-btn",
            });
            btn.addEventListener("click", () => {
                const range = preset.getRange();
                this.periodStart = range.start;
                this.periodEnd = range.end;
                this.refresh();
            });
        }
    }

    private async renderDateSummary(container: HTMLElement): Promise<void> {
        const dailyFile = getDailyNoteByDate(this.app, this.selectedDate, this.settings);
        const today = window.moment().format(this.settings.dailyNoteFormat);
        const isToday = this.selectedDate === today;

        if (!dailyFile) {
            container.createEl("p", {
                text: `${this.selectedDate} の日次ノートがありません`,
                cls: "kozane-no-data",
            });
            return;
        }

        const fileContent = await this.app.vault.cachedRead(dailyFile);
        const logEntries = parseLogEntries(fileContent, this.selectedDate, this.settings);

        // Show PLAN progress for the selected date
        const planEntries = parsePlanEntries(fileContent, this.settings);
        const totalPlannedMinutes = planEntries.reduce((sum, e) => sum + e.plannedMinutes, 0);
        const totalLoggedMinutes = logEntries.reduce((sum, e) => sum + e.durationMinutes, 0);

        if (totalPlannedMinutes > 0) {
            const plannedTaskNames = new Set(planEntries.map((e) => e.taskName));
            const matchedLoggedMinutes = logEntries
                .filter((e) => plannedTaskNames.has(e.taskName))
                .reduce((sum, e) => sum + e.durationMinutes, 0);
            const remainingMinutes = Math.max(0, totalPlannedMinutes - matchedLoggedMinutes);

            const progressSection = container.createDiv({ cls: "kozane-progress" });
            progressSection.createEl("h3", {
                text: `【${this.selectedDate} の作業時間】`,
            });

            const progressInfo = progressSection.createDiv({ cls: "kozane-progress-info" });
            this.addInfoRow(progressInfo, "予定総時間", formatDuration(totalPlannedMinutes));
            this.addInfoRow(progressInfo, "実績時間", formatDuration(totalLoggedMinutes));
            this.addInfoRow(progressInfo, "残り時間", formatDuration(remainingMinutes));

            // Predicted end time (only for today)
            if (isToday && remainingMinutes > 0) {
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
        } else {
            container.createEl("h3", {
                text: `【${this.selectedDate} の作業時間】`,
            });
        }

        this.renderTaskSummary(container, logEntries, "タスク別集計");
    }

    private async renderPeriodSummary(container: HTMLElement): Promise<void> {
        container.createEl("h3", {
            text: `【期間集計】`,
        });
        container.createEl("p", {
            text: `${this.periodStart} 〜 ${this.periodEnd}`,
            cls: "kozane-date-range",
        });

        const entries = await getWorkLogsForDateRange(
            this.app,
            this.periodStart,
            this.periodEnd,
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
        this.addInfoRow(summaryDiv, "稼働日数", `${workDays.size}日`);
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
