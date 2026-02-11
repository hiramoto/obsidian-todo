import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import {
    ActiveWork,
    DEFAULT_SETTINGS,
    PluginSettings,
    VIEW_TYPE_DAILY_SUMMARY,
} from "./src/types";
import { TaskSelectModal, MemoInputModal, getTaskFilesSorted, startWork, endWork } from "./src/commands";
import { updateStatusBar } from "./src/statusbar";
import { createHistoryPostProcessor } from "./src/history-view";
import { DailySummaryView } from "./src/sidebar-view";
import { KozaneJournalSettingTab } from "./src/settings-tab";

export default class KozaneJournalPlugin extends Plugin {
    settings: PluginSettings = DEFAULT_SETTINGS;
    private statusBarEl: HTMLElement | null = null;
    private activeWork: ActiveWork | null = null;
    private statusBarInterval: number | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();

        // --- Status Bar ---
        this.statusBarEl = this.addStatusBarItem();
        this.refreshStatusBar();

        // Auto-refresh status bar every 60 seconds
        this.statusBarInterval = window.setInterval(() => {
            this.refreshStatusBar();
        }, 60000);
        this.registerInterval(this.statusBarInterval);

        // --- Commands ---
        this.addCommand({
            id: "start-work",
            name: "作業開始",
            callback: () => this.handleStartWork(),
        });

        this.addCommand({
            id: "end-work",
            name: "作業終了",
            callback: () => this.handleEndWork(),
        });

        // --- Markdown Post Processor (Task History) ---
        this.registerMarkdownPostProcessor(
            createHistoryPostProcessor(this.app, this.settings)
        );

        // --- Sidebar View ---
        this.registerView(
            VIEW_TYPE_DAILY_SUMMARY,
            (leaf) => new DailySummaryView(leaf, this.settings)
        );

        // Ribbon icon to open sidebar
        this.addRibbonIcon("clock", "Kozane Journal 集計", () => {
            this.activateSidebarView();
        });

        // --- Settings Tab ---
        this.addSettingTab(new KozaneJournalSettingTab(this.app, this));

        // --- File change watcher ---
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                if (file instanceof TFile && file.path.startsWith(this.settings.dailyFolder + "/")) {
                    this.refreshStatusBar();
                    this.refreshSidebarView();
                }
            })
        );

        // --- Refresh on file open ---
        this.registerEvent(
            this.app.workspace.on("file-open", () => {
                this.refreshStatusBar();
            })
        );
    }

    onunload(): void {
        // Interval cleanup is handled by registerInterval
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.refreshStatusBar();
        this.refreshSidebarView();
    }

    // --- Command Handlers ---

    private async handleStartWork(): Promise<void> {
        const taskFiles = await getTaskFilesSorted(this.app, this.settings);

        if (taskFiles.length === 0) {
            new Notice(`❌ タスクフォルダ「${this.settings.tasksFolder}」にファイルがありません`);
            return;
        }

        new TaskSelectModal(this.app, taskFiles, (file) => {
            const result = startWork(this.app, file, this.activeWork, this.settings);
            if (!result.warning) {
                this.activeWork = result.activeWork;
            }
        }).open();
    }

    private async handleEndWork(): Promise<void> {
        if (!this.activeWork) {
            new Notice("⚠️ 作業が開始されていません。先に「作業開始」を実行してください。");
            return;
        }

        const activeWork = this.activeWork;

        new MemoInputModal(this.app, async (memo) => {
            await endWork(this.app, activeWork, memo, this.settings);
            this.activeWork = null;
            this.refreshStatusBar();
            this.refreshSidebarView();
        }).open();
    }

    // --- Status Bar ---

    private refreshStatusBar(): void {
        if (this.statusBarEl) {
            updateStatusBar(this.statusBarEl, this.app, this.settings);
        }
    }

    // --- Sidebar View ---

    private async activateSidebarView(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_SUMMARY);
        if (existing.length > 0) {
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_DAILY_SUMMARY,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    private refreshSidebarView(): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_SUMMARY);
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view instanceof DailySummaryView) {
                view.updateSettings(this.settings);
                view.refresh();
            }
        }
    }
}
