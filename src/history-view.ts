import { App, MarkdownPostProcessorContext, TFile } from "obsidian";
import { PluginSettings, WorkLogEntry } from "./types";
import { formatDuration, getTaskWorkLogs } from "./parser";

/**
 * Register the markdown post processor that adds work history to task files.
 */
export function createHistoryPostProcessor(
    app: App,
    settings: PluginSettings
): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void {
    return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        if (!settings.autoShowHistory) return;

        const filePath = ctx.sourcePath;
        if (!filePath.startsWith(settings.tasksFolder + "/")) return;

        const file = app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;

        // Check for task_id in frontmatter
        const cache = app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter?.task_id) return;

        const taskName = file.basename;

        // We need to detect if this is the last section being processed
        // Use a container div that we can check for later
        const container = el.createDiv({ cls: "taskchute-history-placeholder" });
        container.dataset.taskName = taskName;

        // Defer the actual rendering to avoid blocking
        setTimeout(() => {
            renderHistoryInPlace(app, taskName, container, settings);
        }, 100);
    };
}

/**
 * Render the work history table into the given container element.
 */
async function renderHistoryInPlace(
    app: App,
    taskName: string,
    container: HTMLElement,
    settings: PluginSettings
): Promise<void> {
    // Check if we already rendered (avoid duplicates)
    if (container.dataset.rendered === "true") return;

    // Only render in the last placeholder found in the document
    const parent = container.closest(".markdown-reading-view, .markdown-preview-view");
    if (parent) {
        const allPlaceholders = parent.querySelectorAll(
            `.taskchute-history-placeholder[data-task-name="${taskName}"]`
        );
        const lastPlaceholder = allPlaceholders[allPlaceholders.length - 1];
        if (container !== lastPlaceholder) {
            container.remove();
            return;
        }
    }

    container.dataset.rendered = "true";

    const entries = await getTaskWorkLogs(app, taskName, settings);

    if (entries.length === 0) {
        return; // No history to show
    }

    container.empty();
    container.addClass("taskchute-history");

    // Separator
    container.createEl("hr");

    // Header
    container.createEl("h2", { text: "作業履歴（自動生成）" });

    // Table
    const table = container.createEl("table", { cls: "taskchute-history-table" });

    // Header row
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "日付" });
    headerRow.createEl("th", { text: "時刻" });
    headerRow.createEl("th", { text: "所要時間" });
    headerRow.createEl("th", { text: "メモ" });

    // Body
    const tbody = table.createEl("tbody");
    let totalMinutes = 0;
    const workDays = new Set<string>();

    for (const entry of entries) {
        const row = tbody.createEl("tr");

        // Date with link
        const dateCell = row.createEl("td");
        const dateLink = dateCell.createEl("a", {
            text: entry.date,
            cls: "internal-link",
            href: entry.date,
        });
        dateLink.dataset.href = entry.date;

        // Time
        row.createEl("td", { text: `${entry.startTime}-${entry.endTime}` });

        // Duration
        row.createEl("td", { text: formatDuration(entry.durationMinutes) });

        // Note
        row.createEl("td", { text: entry.note });

        totalMinutes += entry.durationMinutes;
        workDays.add(entry.date);
    }

    // Summary
    const summary = container.createEl("p", { cls: "taskchute-history-summary" });
    summary.createEl("strong", { text: `累計作業時間: ${formatDuration(totalMinutes)}` });
    summary.createEl("br");
    summary.createEl("strong", { text: `作業日数: ${workDays.size}日` });
}
