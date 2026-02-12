import { App, PluginSettingTab, Setting } from "obsidian";
import type KozaneJournalPlugin from "../main";

export class KozaneJournalSettingTab extends PluginSettingTab {
    plugin: KozaneJournalPlugin;

    constructor(app: App, plugin: KozaneJournalPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Kozane Journal 設定" });

        // --- Folder settings ---
        containerEl.createEl("h3", { text: "フォルダ設定" });

        new Setting(containerEl)
            .setName("タスクフォルダ")
            .setDesc("タスクファイルが格納されているフォルダ名")
            .addText((text) =>
                text
                    .setPlaceholder("5-tasks")
                    .setValue(this.plugin.settings.tasksFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.tasksFolder = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("日次ノートフォルダ")
            .setDesc("日次ノートが格納されているフォルダ名")
            .addText((text) =>
                text
                    .setPlaceholder("2-daily")
                    .setValue(this.plugin.settings.dailyFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyFolder = value;
                        await this.plugin.saveSettings();
                    })
            );

        // --- Section name settings ---
        containerEl.createEl("h3", { text: "セクション名" });

        new Setting(containerEl)
            .setName("予定セクション名")
            .setDesc("日次ノートの予定セクションのヘッダー名")
            .addText((text) =>
                text
                    .setPlaceholder("PLAN")
                    .setValue(this.plugin.settings.planSectionName)
                    .onChange(async (value) => {
                        this.plugin.settings.planSectionName = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("実績セクション名")
            .setDesc("日次ノートの実績セクションのヘッダー名")
            .addText((text) =>
                text
                    .setPlaceholder("LOG")
                    .setValue(this.plugin.settings.logSectionName)
                    .onChange(async (value) => {
                        this.plugin.settings.logSectionName = value;
                        await this.plugin.saveSettings();
                    })
            );

        // --- Daily note settings ---
        containerEl.createEl("h3", { text: "日次ノート" });

        new Setting(containerEl)
            .setName("ファイル名形式")
            .setDesc("moment.js形式で指定（例: YYYY-MM-DD）")
            .addText((text) =>
                text
                    .setPlaceholder("YYYY-MM-DD")
                    .setValue(this.plugin.settings.dailyNoteFormat)
                    .onChange(async (value) => {
                        this.plugin.settings.dailyNoteFormat = value;
                        await this.plugin.saveSettings();
                    })
            );

        // --- Time settings ---
        containerEl.createEl("h3", { text: "時刻設定" });

        new Setting(containerEl)
            .setName("時刻丸め（分）")
            .setDesc("作業開始/終了時刻を指定分単位で丸めます")
            .addText((text) =>
                text
                    .setPlaceholder("5")
                    .setValue(String(this.plugin.settings.timeRoundingMinutes))
                    .onChange(async (value) => {
                        const num = parseInt(value);
                        if (!isNaN(num) && num > 0) {
                            this.plugin.settings.timeRoundingMinutes = num;
                            await this.plugin.saveSettings();
                        }
                    })
            );

        // --- Lunch break settings ---
        containerEl.createEl("h3", { text: "昼休み設定" });

        new Setting(containerEl)
            .setName("昼休み開始時刻")
            .setDesc("昼休みの開始時刻（HH:MM形式）。予定終了時刻の計算で除外されます")
            .addText((text) =>
                text
                    .setPlaceholder("12:00")
                    .setValue(this.plugin.settings.lunchStartTime)
                    .onChange(async (value) => {
                        if (/^\d{2}:\d{2}$/.test(value)) {
                            this.plugin.settings.lunchStartTime = value;
                            await this.plugin.saveSettings();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("昼休み終了時刻")
            .setDesc("昼休みの終了時刻（HH:MM形式）")
            .addText((text) =>
                text
                    .setPlaceholder("13:00")
                    .setValue(this.plugin.settings.lunchEndTime)
                    .onChange(async (value) => {
                        if (/^\d{2}:\d{2}$/.test(value)) {
                            this.plugin.settings.lunchEndTime = value;
                            await this.plugin.saveSettings();
                        }
                    })
            );

        // --- Display settings ---
        containerEl.createEl("h3", { text: "表示設定" });

        new Setting(containerEl)
            .setName("ステータスバーに予定終了時刻を表示")
            .setDesc("ステータスバーに今日の予定終了時刻を表示します")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showStatusBar)
                    .onChange(async (value) => {
                        this.plugin.settings.showStatusBar = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("タスクファイルに作業履歴を自動表示")
            .setDesc("タスクファイルを開いたとき、作業履歴を自動的に表示します")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoShowHistory)
                    .onChange(async (value) => {
                        this.plugin.settings.autoShowHistory = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
