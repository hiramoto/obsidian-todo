import { App, FuzzySuggestModal, Modal, Notice, Setting, TFile } from "obsidian";
import { ActiveWork, PluginSettings } from "./types";
import { formatTime, roundTime } from "./parser";

/**
 * Modal for selecting a task file from the tasks folder.
 * Prioritizes in-progress tasks.
 */
export class TaskSelectModal extends FuzzySuggestModal<TFile> {
    private taskFiles: TFile[];
    private onSelect: (file: TFile) => void;

    constructor(app: App, taskFiles: TFile[], onSelect: (file: TFile) => void) {
        super(app);
        this.taskFiles = taskFiles;
        this.onSelect = onSelect;
        this.setPlaceholder("タスクを選択してください...");
    }

    getItems(): TFile[] {
        return this.taskFiles;
    }

    getItemText(item: TFile): string {
        return item.basename;
    }

    onChooseItem(item: TFile): void {
        this.onSelect(item);
    }
}

/**
 * Modal for entering a memo when ending work.
 */
export class MemoInputModal extends Modal {
    private onSubmit: (memo: string) => void;
    private memo: string = "";

    constructor(app: App, onSubmit: (memo: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: "作業メモ（省略可）" });

        new Setting(contentEl)
            .setName("メモ")
            .addText((text) => {
                text.setPlaceholder("作業内容を記入...");
                text.onChange((value) => {
                    this.memo = value;
                });
                // Enter key to submit
                text.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        this.close();
                        this.onSubmit(this.memo);
                    }
                });
                // Auto focus
                setTimeout(() => text.inputEl.focus(), 50);
            });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("記録する")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit(this.memo);
                    })
            )
            .addButton((btn) =>
                btn.setButtonText("キャンセル").onClick(() => {
                    this.close();
                })
            );
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Get task files sorted by status (in-progress first).
 */
export async function getTaskFilesSorted(app: App, settings: PluginSettings): Promise<TFile[]> {
    const tasksFolder = settings.tasksFolder;
    const allFiles = app.vault.getFiles();
    const taskFiles = allFiles.filter(
        (f) => f.path.startsWith(tasksFolder + "/") && f.extension === "md"
    );

    // Sort: in-progress tasks first, then by name
    const sorted: { file: TFile; isInProgress: boolean }[] = [];

    for (const file of taskFiles) {
        const cache = app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        const isInProgress = frontmatter?.status === "in-progress";
        sorted.push({ file, isInProgress });
    }

    sorted.sort((a, b) => {
        if (a.isInProgress && !b.isInProgress) return -1;
        if (!a.isInProgress && b.isInProgress) return 1;
        return a.file.basename.localeCompare(b.file.basename);
    });

    return sorted.map((s) => s.file);
}

/**
 * Start work on a task.
 */
export function startWork(
    app: App,
    taskFile: TFile,
    activeWork: ActiveWork | null,
    settings: PluginSettings
): { activeWork: ActiveWork; warning: boolean } {
    let warning = false;

    if (activeWork) {
        new Notice(
            `⚠️ 「${activeWork.taskName}」の作業中です。先に作業終了してください。`,
            5000
        );
        warning = true;
    }

    const now = roundTime(new Date(), settings.timeRoundingMinutes);
    const newActiveWork: ActiveWork = {
        taskName: taskFile.basename,
        taskPath: taskFile.path,
        startTime: now,
    };

    new Notice(`▶️ タスク: ${taskFile.basename} の作業を開始しました (${formatTime(now)})`);

    return { activeWork: newActiveWork, warning };
}

/**
 * End work and record it to the daily note.
 */
export async function endWork(
    app: App,
    activeWork: ActiveWork,
    memo: string,
    settings: PluginSettings
): Promise<void> {
    const endTime = roundTime(new Date(), settings.timeRoundingMinutes);
    const startTimeStr = formatTime(activeWork.startTime);
    const endTimeStr = formatTime(endTime);

    const durationMs = endTime.getTime() - activeWork.startTime.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    // Build the log line
    let logLine = `- ${startTimeStr}-${endTimeStr} [[${activeWork.taskName}]]`;
    if (memo) {
        logLine += ` / ${memo}`;
    }

    // Get or create today's daily note
    const today = window.moment().format(settings.dailyNoteFormat);
    const dailyPath = `${settings.dailyFolder}/${today}.md`;

    let dailyFile = app.vault.getAbstractFileByPath(dailyPath);

    if (!dailyFile) {
        // Ensure the daily folder exists
        const folderExists = app.vault.getAbstractFileByPath(settings.dailyFolder);
        if (!folderExists) {
            await app.vault.createFolder(settings.dailyFolder);
        }

        // Create daily note with template
        const template = `# ${today}\n\n## ${settings.planSectionName}\n\n\n---\n\n## ${settings.logSectionName}\n\n\n---\n\n## メモ\n`;
        await app.vault.create(dailyPath, template);
        dailyFile = app.vault.getAbstractFileByPath(dailyPath);
    }

    if (!(dailyFile instanceof TFile)) {
        new Notice("❌ 日次ノートの作成に失敗しました");
        return;
    }

    // Read current content and add log entry
    let content = await app.vault.read(dailyFile);
    const logSectionHeader = `## ${settings.logSectionName}`;
    const logSectionIndex = content.indexOf(logSectionHeader);

    if (logSectionIndex === -1) {
        // LOG section doesn't exist, add it
        content += `\n\n${logSectionHeader}\n\n${logLine}\n`;
    } else {
        // Find the end of the LOG section (next ## or end of file)
        const afterHeader = logSectionIndex + logSectionHeader.length;
        const nextSectionIndex = content.indexOf("\n##", afterHeader);
        // Also check for --- separator
        const nextSeparatorIndex = content.indexOf("\n---", afterHeader);

        let insertIndex: number;
        if (nextSectionIndex === -1 && nextSeparatorIndex === -1) {
            insertIndex = content.length;
        } else if (nextSectionIndex === -1) {
            insertIndex = nextSeparatorIndex;
        } else if (nextSeparatorIndex === -1) {
            insertIndex = nextSectionIndex;
        } else {
            insertIndex = Math.min(nextSectionIndex, nextSeparatorIndex);
        }

        // Find the last non-empty line before insertIndex to place our entry
        const beforeInsert = content.substring(afterHeader, insertIndex);
        const trimmed = beforeInsert.trimEnd();

        const newContent =
            content.substring(0, afterHeader) +
            trimmed +
            (trimmed.length > 0 ? "\n" : "\n") +
            logLine +
            "\n" +
            content.substring(insertIndex);

        content = newContent;
    }

    await app.vault.modify(dailyFile, content);

    new Notice(`✅ 作業を記録しました（${durationMinutes}分）`);
}
