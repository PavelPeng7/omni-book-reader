import { App, Modal, Plugin, PluginSettingTab, Setting } from "obsidian";
import { uiText } from "./i18n";
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
  const t = (zh: string, en: string): string => uiText(get().interfaceLanguage, zh, en);

  new Setting(container)
    .setName(t("阅读主题", "Reading theme"))
    .setDesc(t("跟随 Obsidian，或为电子书指定独立主题。", "Follow Obsidian or choose a separate theme for ebooks."))
    .addDropdown((dropdown) => dropdown
      .addOptions({
        auto: t("跟随 Obsidian", "Follow Obsidian"),
        light: t("浅色", "Light"),
        dark: t("深色", "Dark"),
        sepia: t("纸张色", "Sepia"),
      })
      .setValue(get().theme)
      .onChange((theme) => host.updateReaderSettings({ theme: theme as ReaderSettings["theme"] })));

  new Setting(container)
    .setName(t("阅读布局", "Reading layout"))
    .setDesc(fixedLayout
      ? t("固定版式 EPUB 使用书籍指定的布局。", "Fixed-layout EPUBs use the layout defined by the book.")
      : t("在分页和连续滚动之间切换。", "Switch between paginated and continuous scrolling."))
    .addDropdown((dropdown) => {
      dropdown
        .addOptions({ paginated: t("分页", "Paginated"), scrolled: t("连续滚动", "Continuous scroll") })
        .setValue(get().layout)
        .setDisabled(fixedLayout)
        .onChange((layout) => host.updateReaderSettings({ layout: layout as ReaderSettings["layout"] }));
    });

  new Setting(container)
    .setName(t("字体", "Font"))
    .setDesc(t("跟随 Obsidian 可避免书内字体混杂；原书字体保留出版社排版。", "Follow Obsidian for consistent typography, or keep the publisher's fonts."))
    .addDropdown((dropdown) => dropdown
      .addOptions({
        obsidian: t("跟随 Obsidian", "Follow Obsidian"),
        publisher: t("原书字体", "Publisher fonts"),
        serif: t("中文衬线", "Serif"),
        sans: t("中文无衬线", "Sans serif"),
      })
      .setValue(get().font)
      .setDisabled(fixedLayout)
      .onChange((font) => host.updateReaderSettings({ font: font as ReaderSettings["font"] })));

  new Setting(container)
    .setName(t("字号", "Font size"))
    .setDesc(`${get().fontSizePercent}%`)
    .addSlider((slider) => slider
      .setLimits(80, 180, 5)
      .setValue(get().fontSizePercent)
      .setDisabled(fixedLayout)
      .onChange((fontSizePercent) => host.updateReaderSettings({ fontSizePercent })));

  new Setting(container)
    .setName(t("行高", "Line height"))
    .setDesc(get().lineHeight.toFixed(2))
    .addSlider((slider) => slider
      .setLimits(1.2, 2.2, 0.1)
      .setValue(get().lineHeight)
      .setDisabled(fixedLayout)
      .onChange((lineHeight) => host.updateReaderSettings({ lineHeight })));

  new Setting(container)
    .setName(t("字距", "Letter spacing"))
    .setDesc(`${get().letterSpacing.toFixed(2)}em`)
    .addSlider((slider) => slider
      .setLimits(-0.02, 0.12, 0.01)
      .setValue(get().letterSpacing)
      .setDisabled(fixedLayout)
      .onChange((letterSpacing) => host.updateReaderSettings({ letterSpacing })));

  new Setting(container)
    .setName(t("段落间距", "Paragraph spacing"))
    .setDesc(`${get().paragraphSpacing.toFixed(2)}em`)
    .addSlider((slider) => slider
      .setLimits(0, 1.2, 0.05)
      .setValue(get().paragraphSpacing)
      .setDisabled(fixedLayout)
      .onChange((paragraphSpacing) => host.updateReaderSettings({ paragraphSpacing })));

  new Setting(container)
    .setName(t("页面宽度", "Page width"))
    .setDesc(t("标准适合长文；宽版和全宽增加横向空间；贴边会移除书页边距。", "Standard suits long-form reading; wide and full add space; edge removes page margins."))
    .addDropdown((dropdown) => dropdown
      .addOptions({
        standard: t("标准", "Standard"),
        wide: t("宽版", "Wide"),
        full: t("全宽", "Full width"),
        edge: t("贴边", "Edge to edge"),
      })
      .setValue(get().widthMode)
      .setDisabled(fixedLayout)
      .onChange((widthMode) => host.updateReaderSettings({ widthMode: widthMode as ReaderSettings["widthMode"] })));

  new Setting(container)
    .setName(t("页边距", "Page margin"))
    .setDesc(`${get().pageMargin}px`)
    .addSlider((slider) => slider
      .setLimits(0, 80, 4)
      .setValue(get().pageMargin)
      .setDisabled(fixedLayout)
      .onChange((pageMargin) => host.updateReaderSettings({ pageMargin })));

  new Setting(container)
    .setName(t("舒适排版", "Comfortable typography"))
    .setDesc(t("恢复适合中文长文阅读的字体、行高、字距、段落间距、正文宽度和页边距。", "Restore comfortable defaults for font, rhythm, content width, and page margins."))
    .addButton((button) => button
      .setButtonText(t("恢复舒适默认值", "Restore comfortable defaults"))
      .setDisabled(fixedLayout)
      .onClick(() => host.updateReaderSettings({
        font: "obsidian",
        fontSizePercent: 100,
        lineHeight: 1.7,
        letterSpacing: 0.01,
        paragraphSpacing: 0.65,
        widthMode: "standard",
        contentWidth: 720,
        pageMargin: 48,
      })));

  new Setting(container).setName(t("标注导出", "Annotation export")).setHeading();

  new Setting(container)
    .setName(t("导出模板", "Export template"))
    .setDesc(t("控制高亮和笔记文档中每条标注的排版方式。", "Control how each annotation appears in highlight and note documents."))
    .addDropdown((dropdown) => dropdown
      .addOptions({
        classic: t("经典分段", "Classic sections"),
        compact: t("紧凑列表", "Compact list"),
        callout: "Obsidian Callout",
        custom: t("自定义模板", "Custom template"),
      })
      .setValue(get().exportTemplate)
      .onChange((exportTemplate) => host.updateReaderSettings({
        exportTemplate: exportTemplate as ReaderSettings["exportTemplate"],
      })));

  new Setting(container)
    .setName(t("自定义导出模板", "Custom export template"))
    .setDesc(t(
      "选择“自定义模板”后生效。填写 Vault 内 Markdown 文件路径，支持 {{document.title}}、{{document.kind}}、{{book.title}}、{{book.author}}、{{book.filePath}}、{{export.date}} 和 {{entries}}。",
      "Used when Custom template is selected. Enter a Markdown path in the Vault. Supports {{document.title}}, {{document.kind}}, {{book.title}}, {{book.author}}, {{book.filePath}}, {{export.date}}, and {{entries}}.",
    ))
    .addText((text) => text
      .setPlaceholder(t("模板/EPUB 标注导出.md", "Templates/EPUB annotation export.md"))
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
    const language = this.host.getReaderSettings().interfaceLanguage;
    this.titleEl.setText(uiText(language, "EPUB 阅读设置", "EPUB reading settings"));
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
    const language = this.host.getReaderSettings().interfaceLanguage;
    const t = (zh: string, en: string): string => uiText(language, zh, en);
    new Setting(this.containerEl)
      .setName(t("界面语言", "Interface language"))
      .setDesc(t("切换 OmniReader 的菜单、阅读器、书架和提示语言。", "Change the language used by OmniReader menus, reader, bookshelf, and notices."))
      .addDropdown((dropdown) => dropdown
        .addOptions({ zh: "中文", en: "English" })
        .setValue(language)
        .onChange((interfaceLanguage) => {
          this.host.updateReaderSettings({ interfaceLanguage: interfaceLanguage as ReaderSettings["interfaceLanguage"] });
          this.display();
        }));
    new Setting(this.containerEl).setName(t("阅读设置", "Reading settings")).setHeading();
    renderSettings(this.containerEl, this.host, false);
  }
}
