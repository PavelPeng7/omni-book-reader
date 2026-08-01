import { App, Modal, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { ReaderSettings } from "./types";

export interface SettingsHost {
  app: App;
  getReaderSettings(): ReaderSettings;
  updateReaderSettings(patch: Partial<ReaderSettings>): void;
}

function renderSettings(
  container: HTMLElement,
  host: SettingsHost,
  fixedLayout: boolean,
): void {
  const get = (): ReaderSettings => host.getReaderSettings();

  new Setting(container)
    .setName("阅读主题")
    .setDesc("跟随 Obsidian，或为电子书指定独立主题。")
    .addDropdown((dropdown) => dropdown
      .addOptions({ auto: "跟随 Obsidian", light: "浅色", dark: "深色", sepia: "纸张色" })
      .setValue(get().theme)
      .onChange((theme) => host.updateReaderSettings({ theme: theme as ReaderSettings["theme"] })));

  new Setting(container)
    .setName("阅读布局")
    .setDesc(fixedLayout ? "固定版式 EPUB 使用书籍指定的布局。" : "在分页和连续滚动之间切换。")
    .addDropdown((dropdown) => {
      dropdown
        .addOptions({ paginated: "分页", scrolled: "连续滚动" })
        .setValue(get().layout)
        .setDisabled(fixedLayout)
        .onChange((layout) => host.updateReaderSettings({ layout: layout as ReaderSettings["layout"] }));
    });

  new Setting(container)
    .setName("字体")
    .setDesc("跟随 Obsidian 可避免书内字体混杂；原书字体保留出版社排版。")
    .addDropdown((dropdown) => dropdown
      .addOptions({ obsidian: "跟随 Obsidian", publisher: "原书字体", serif: "中文衬线", sans: "中文无衬线" })
      .setValue(get().font)
      .setDisabled(fixedLayout)
      .onChange((font) => host.updateReaderSettings({ font: font as ReaderSettings["font"] })));

  new Setting(container)
    .setName("字号")
    .setDesc(`${get().fontSizePercent}%`)
    .addSlider((slider) => slider
      .setLimits(80, 180, 5)
      .setValue(get().fontSizePercent)
      .setDynamicTooltip()
      .setDisabled(fixedLayout)
      .onChange((fontSizePercent) => host.updateReaderSettings({ fontSizePercent })));

  new Setting(container)
    .setName("行高")
    .setDesc(get().lineHeight.toFixed(2))
    .addSlider((slider) => slider
      .setLimits(1.2, 2.2, 0.1)
      .setValue(get().lineHeight)
      .setDynamicTooltip()
      .setDisabled(fixedLayout)
      .onChange((lineHeight) => host.updateReaderSettings({ lineHeight })));

  new Setting(container)
    .setName("字距")
    .setDesc(`${get().letterSpacing.toFixed(2)}em`)
    .addSlider((slider) => slider
      .setLimits(-0.02, 0.12, 0.01)
      .setValue(get().letterSpacing)
      .setDynamicTooltip()
      .setDisabled(fixedLayout)
      .onChange((letterSpacing) => host.updateReaderSettings({ letterSpacing })));

  new Setting(container)
    .setName("段落间距")
    .setDesc(`${get().paragraphSpacing.toFixed(2)}em`)
    .addSlider((slider) => slider
      .setLimits(0, 1.2, 0.05)
      .setValue(get().paragraphSpacing)
      .setDynamicTooltip()
      .setDisabled(fixedLayout)
      .onChange((paragraphSpacing) => host.updateReaderSettings({ paragraphSpacing })));

  new Setting(container)
    .setName("正文宽度")
    .setDesc(`${get().contentWidth}px`)
    .addSlider((slider) => slider
      .setLimits(480, 1200, 20)
      .setValue(get().contentWidth)
      .setDynamicTooltip()
      .setDisabled(fixedLayout)
      .onChange((contentWidth) => host.updateReaderSettings({ contentWidth })));

  new Setting(container)
    .setName("页边距")
    .setDesc(`${get().pageMargin}px`)
    .addSlider((slider) => slider
      .setLimits(0, 80, 4)
      .setValue(get().pageMargin)
      .setDynamicTooltip()
      .setDisabled(fixedLayout)
      .onChange((pageMargin) => host.updateReaderSettings({ pageMargin })));

  new Setting(container)
    .setName("舒适排版")
    .setDesc("恢复适合中文长文阅读的字体、行高、字距、段落间距、正文宽度和页边距。")
    .addButton((button) => button
      .setButtonText("恢复舒适默认值")
      .setDisabled(fixedLayout)
      .onClick(() => host.updateReaderSettings({
        font: "obsidian",
        fontSizePercent: 100,
        lineHeight: 1.7,
        letterSpacing: 0.01,
        paragraphSpacing: 0.65,
        contentWidth: 720,
        pageMargin: 48,
      })));

  container.createEl("h3", { text: "标注导出" });

  new Setting(container)
    .setName("导出模板")
    .setDesc("控制高亮和笔记文档中每条标注的排版方式。")
    .addDropdown((dropdown) => dropdown
      .addOptions({ classic: "经典分段", compact: "紧凑列表", callout: "Obsidian Callout", custom: "自定义模板" })
      .setValue(get().exportTemplate)
      .onChange((exportTemplate) => host.updateReaderSettings({
        exportTemplate: exportTemplate as ReaderSettings["exportTemplate"],
      })));

  new Setting(container)
    .setName("自定义导出模板")
    .setDesc("选择“自定义模板”后生效。填写 Vault 内 Markdown 文件路径，支持 {{document.title}}、{{document.kind}}、{{book.title}}、{{book.author}}、{{book.filePath}}、{{export.date}} 和 {{entries}}。")
    .addText((text) => text
      .setPlaceholder("模板/EPUB 标注导出.md")
      .setValue(get().customExportTemplatePath)
      .onChange((customExportTemplatePath) => host.updateReaderSettings({ customExportTemplatePath })));
}

export class ReaderSettingsModal extends Modal {
  constructor(
    app: App,
    private readonly host: SettingsHost,
    private readonly fixedLayout: boolean,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("EPUB 阅读设置");
    this.contentEl.addClass("pavel-epub-settings");
    renderSettings(this.contentEl, this.host, this.fixedLayout);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class PavelEpubSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly host: SettingsHost & Plugin) {
    super(app, host);
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass("pavel-epub-settings-page");
    this.containerEl.createEl("h2", { text: "OmniReader" });
    renderSettings(this.containerEl, this.host, false);
  }
}
