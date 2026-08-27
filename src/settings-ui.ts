import { App, Modal, Plugin, PluginSettingTab, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
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
    .setName(t("点触翻页", "Tap to turn pages"))
    .setDesc(t("在分页阅读中点击左半区上一页、右半区下一页，桌面端和移动端均可使用。", "In paginated reading, click or tap the left half for the previous page and the right half for the next page on desktop and mobile."))
    .addToggle((toggle) => toggle
      .setValue(get().tapToTurnPages)
      .onChange((tapToTurnPages) => host.updateReaderSettings({ tapToTurnPages })));

  new Setting(container)
    .setName(t("阅读工具栏自动弱化", "Auto-hide reader chrome"))
    .setDesc(t("翻页或滚动后弱化工具栏；移动鼠标、触摸正文中央或键盘聚焦时恢复。", "Fade reader controls after navigation and reveal them on pointer, touch, or keyboard activity."))
    .addToggle((toggle) => toggle
      .setValue(get().readerChromeAutoHide)
      .onChange((readerChromeAutoHide) => host.updateReaderSettings({ readerChromeAutoHide })));

  new Setting(container)
    .setName(t("界面密度", "Interface density"))
    .setDesc(t("紧凑模式只减少装饰留白，不缩小触控区域。", "Compact mode reduces decorative spacing without shrinking touch targets."))
    .addDropdown((dropdown) => dropdown
      .addOptions({ comfortable: t("舒适", "Comfortable"), compact: t("紧凑", "Compact") })
      .setValue(get().interfaceDensity)
      .onChange((interfaceDensity) => host.updateReaderSettings({ interfaceDensity: interfaceDensity as ReaderSettings["interfaceDensity"] })));

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
    .setName(t("默认高亮颜色", "Default highlight color"))
    .setDesc(t("新建标注时优先使用该颜色。", "Use this color first when creating an annotation."))
    .addDropdown((dropdown) => dropdown
      .addOptions({ yellow: t("黄色", "Yellow"), green: t("绿色", "Green"), blue: t("蓝色", "Blue"), pink: t("粉色", "Pink") })
      .setValue(get().defaultHighlightColor)
      .onChange((defaultHighlightColor) => host.updateReaderSettings({ defaultHighlightColor: defaultHighlightColor as ReaderSettings["defaultHighlightColor"] })));

  new Setting(container)
    .setName(t("默认标注样式", "Default annotation style"))
    .addDropdown((dropdown) => dropdown
      .addOptions({ highlight: t("高亮", "Highlight"), underline: t("下划线", "Underline"), strikethrough: t("删除线", "Strikethrough"), squiggly: t("波浪线", "Squiggly") })
      .setValue(get().defaultHighlightStyle)
      .onChange((defaultHighlightStyle) => host.updateReaderSettings({ defaultHighlightStyle: defaultHighlightStyle as ReaderSettings["defaultHighlightStyle"] })));

  new Setting(container)
    .setName(t("合并相邻高亮", "Merge adjacent highlights"))
    .setDesc(t("相同章节、颜色和样式的相邻选区保存为一条标注。", "Save adjacent selections with matching chapter, color, and style as one annotation."))
    .addToggle((toggle) => toggle
      .setValue(get().connectAdjacentHighlights)
      .onChange((connectAdjacentHighlights) => host.updateReaderSettings({ connectAdjacentHighlights })));

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
    this.modalEl.addClass("omni-book-reader-settings-modal");
    const language = this.host.getReaderSettings().interfaceLanguage;
    this.titleEl.setText(uiText(language, "EPUB 阅读设置", "EPUB reading settings"));
    this.contentEl.addClass("omni-book-reader-settings");
    renderSettings(this.contentEl, this.host, this.fixedLayout);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class OmniBookReaderSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly host: SettingsHost & Plugin) {
    super(app, host);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const language = this.host.getReaderSettings().interfaceLanguage;
    const t = (zh: string, en: string): string => uiText(language, zh, en);

    return [
      {
        type: "group",
        heading: t("阅读设置", "Reading settings"),
        cls: "omni-book-reader-settings-page",
        items: [
          {
            name: t("界面语言", "Interface language"),
            desc: t("切换 Omni Book Reader 的菜单、阅读器、书架和提示语言。", "Change the language used by Omni Book Reader menus, reader, bookshelf, and notices."),
            control: {
              type: "dropdown",
              key: "interfaceLanguage",
              options: { zh: "中文", en: "English" },
            },
          },
          {
            name: t("阅读主题", "Reading theme"),
            desc: t("跟随 Obsidian，或为电子书指定独立主题。", "Follow Obsidian or choose a separate theme for ebooks."),
            control: {
              type: "dropdown",
              key: "theme",
              options: {
                auto: t("跟随 Obsidian", "Follow Obsidian"),
                light: t("浅色", "Light"),
                dark: t("深色", "Dark"),
                sepia: t("纸张色", "Sepia"),
              },
            },
          },
          {
            name: t("阅读布局", "Reading layout"),
            desc: t("在分页和连续滚动之间切换。", "Switch between paginated and continuous scrolling."),
            control: {
              type: "dropdown",
              key: "layout",
              options: {
                paginated: t("分页", "Paginated"),
                scrolled: t("连续滚动", "Continuous scroll"),
              },
            },
          },
          {
            name: t("点触翻页", "Tap to turn pages"),
            desc: t("在分页阅读中点击左半区上一页、右半区下一页，桌面端和移动端均可使用。", "In paginated reading, click or tap the left half for the previous page and the right half for the next page on desktop and mobile."),
            control: {
              type: "toggle",
              key: "tapToTurnPages",
            },
          },
          {
            name: t("阅读工具栏自动弱化", "Auto-hide reader chrome"),
            desc: t("翻页或滚动后弱化工具栏，交互时自动恢复。", "Fade reader controls after navigation and reveal them during interaction."),
            control: { type: "toggle", key: "readerChromeAutoHide" },
          },
          {
            name: t("界面密度", "Interface density"),
            desc: t("紧凑模式不会缩小触控区域。", "Compact mode keeps full-size touch targets."),
            control: {
              type: "dropdown", key: "interfaceDensity",
              options: { comfortable: t("舒适", "Comfortable"), compact: t("紧凑", "Compact") },
            },
          },
          {
            name: t("字体", "Font"),
            desc: t("跟随 Obsidian 可避免书内字体混杂；原书字体保留出版社排版。", "Follow Obsidian for consistent typography, or keep the publisher's fonts."),
            control: {
              type: "dropdown",
              key: "font",
              options: {
                obsidian: t("跟随 Obsidian", "Follow Obsidian"),
                publisher: t("原书字体", "Publisher fonts"),
                serif: t("中文衬线", "Serif"),
                sans: t("中文无衬线", "Sans serif"),
              },
            },
          },
          {
            name: t("字号", "Font size"),
            control: {
              type: "slider",
              key: "fontSizePercent",
              min: 80,
              max: 180,
              step: 5,
              displayFormat: (value) => `${value}%`,
            },
          },
          {
            name: t("行高", "Line height"),
            control: {
              type: "slider",
              key: "lineHeight",
              min: 1.2,
              max: 2.2,
              step: 0.1,
              displayFormat: (value) => value.toFixed(2),
            },
          },
          {
            name: t("字距", "Letter spacing"),
            control: {
              type: "slider",
              key: "letterSpacing",
              min: -0.02,
              max: 0.12,
              step: 0.01,
              displayFormat: (value) => `${value.toFixed(2)}em`,
            },
          },
          {
            name: t("段落间距", "Paragraph spacing"),
            control: {
              type: "slider",
              key: "paragraphSpacing",
              min: 0,
              max: 1.2,
              step: 0.05,
              displayFormat: (value) => `${value.toFixed(2)}em`,
            },
          },
          {
            name: t("页面宽度", "Page width"),
            desc: t("标准适合长文；宽版和全宽增加横向空间；贴边会移除书页边距。", "Standard suits long-form reading; wide and full add space; edge removes page margins."),
            control: {
              type: "dropdown",
              key: "widthMode",
              options: {
                standard: t("标准", "Standard"),
                wide: t("宽版", "Wide"),
                full: t("全宽", "Full width"),
                edge: t("贴边", "Edge to edge"),
              },
            },
          },
          {
            name: t("页边距", "Page margin"),
            control: {
              type: "slider",
              key: "pageMargin",
              min: 0,
              max: 80,
              step: 4,
              displayFormat: (value) => `${value}px`,
            },
          },
          {
            name: t("舒适排版", "Comfortable typography"),
            desc: t("恢复适合中文长文阅读的字体、行高、字距、段落间距、正文宽度和页边距。", "Restore comfortable defaults for font, rhythm, content width, and page margins."),
            action: () => {
              this.host.updateReaderSettings({
                font: "obsidian",
                fontSizePercent: 100,
                lineHeight: 1.7,
                letterSpacing: 0.01,
                paragraphSpacing: 0.65,
                widthMode: "standard",
                contentWidth: 720,
                pageMargin: 48,
              });
            },
          },
        ],
      },
      {
        type: "group",
        heading: t("标注导出", "Annotation export"),
        cls: "omni-book-reader-settings-page",
        items: [
          {
            name: t("默认高亮颜色", "Default highlight color"),
            control: {
              type: "dropdown", key: "defaultHighlightColor",
              options: { yellow: t("黄色", "Yellow"), green: t("绿色", "Green"), blue: t("蓝色", "Blue"), pink: t("粉色", "Pink") },
            },
          },
          {
            name: t("默认标注样式", "Default annotation style"),
            control: {
              type: "dropdown", key: "defaultHighlightStyle",
              options: { highlight: t("高亮", "Highlight"), underline: t("下划线", "Underline"), strikethrough: t("删除线", "Strikethrough"), squiggly: t("波浪线", "Squiggly") },
            },
          },
          {
            name: t("合并相邻高亮", "Merge adjacent highlights"),
            control: { type: "toggle", key: "connectAdjacentHighlights" },
          },
          {
            name: t("导出模板", "Export template"),
            desc: t("控制高亮和笔记文档中每条标注的排版方式。", "Control how each annotation appears in highlight and note documents."),
            control: {
              type: "dropdown",
              key: "exportTemplate",
              options: {
                classic: t("经典分段", "Classic sections"),
                compact: t("紧凑列表", "Compact list"),
                callout: "Obsidian Callout",
                custom: t("自定义模板", "Custom template"),
              },
            },
          },
          {
            name: t("自定义导出模板", "Custom export template"),
            desc: t(
              "选择“自定义模板”后生效。填写 Vault 内 Markdown 文件路径，支持 {{document.title}}、{{document.kind}}、{{book.title}}、{{book.author}}、{{book.filePath}}、{{export.date}} 和 {{entries}}。",
              "Used when Custom template is selected. Enter a Markdown path in the Vault. Supports {{document.title}}, {{document.kind}}, {{book.title}}, {{book.author}}, {{book.filePath}}, {{export.date}}, and {{entries}}.",
            ),
            control: {
              type: "text",
              key: "customExportTemplatePath",
              placeholder: t("模板/EPUB 标注导出.md", "Templates/EPUB annotation export.md"),
            },
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    const settings = this.host.getReaderSettings();
    switch (key) {
      case "interfaceLanguage": return settings.interfaceLanguage;
      case "theme": return settings.theme;
      case "layout": return settings.layout;
      case "tapToTurnPages": return settings.tapToTurnPages;
      case "readerChromeAutoHide": return settings.readerChromeAutoHide;
      case "interfaceDensity": return settings.interfaceDensity;
      case "defaultHighlightColor": return settings.defaultHighlightColor;
      case "defaultHighlightStyle": return settings.defaultHighlightStyle;
      case "connectAdjacentHighlights": return settings.connectAdjacentHighlights;
      case "font": return settings.font;
      case "fontSizePercent": return settings.fontSizePercent;
      case "lineHeight": return settings.lineHeight;
      case "letterSpacing": return settings.letterSpacing;
      case "paragraphSpacing": return settings.paragraphSpacing;
      case "widthMode": return settings.widthMode;
      case "pageMargin": return settings.pageMargin;
      case "exportTemplate": return settings.exportTemplate;
      case "customExportTemplatePath": return settings.customExportTemplatePath;
      default: return undefined;
    }
  }

  setControlValue(key: string, value: unknown): void {
    switch (key) {
      case "interfaceLanguage":
        if (value === "zh" || value === "en") {
          this.host.updateReaderSettings({ interfaceLanguage: value });
        }
        return;
      case "theme":
        if (value === "auto" || value === "light" || value === "dark" || value === "sepia") {
          this.host.updateReaderSettings({ theme: value });
        }
        return;
      case "layout":
        if (value === "paginated" || value === "scrolled") this.host.updateReaderSettings({ layout: value });
        return;
      case "tapToTurnPages":
        if (typeof value === "boolean") this.host.updateReaderSettings({ tapToTurnPages: value });
        return;
      case "readerChromeAutoHide":
        if (typeof value === "boolean") this.host.updateReaderSettings({ readerChromeAutoHide: value });
        return;
      case "connectAdjacentHighlights":
        if (typeof value === "boolean") this.host.updateReaderSettings({ connectAdjacentHighlights: value });
        return;
      case "interfaceDensity":
        if (value === "comfortable" || value === "compact") this.host.updateReaderSettings({ interfaceDensity: value });
        return;
      case "defaultHighlightColor":
        if (value === "yellow" || value === "green" || value === "blue" || value === "pink") this.host.updateReaderSettings({ defaultHighlightColor: value });
        return;
      case "defaultHighlightStyle":
        if (value === "highlight" || value === "underline" || value === "strikethrough" || value === "squiggly") this.host.updateReaderSettings({ defaultHighlightStyle: value });
        return;
      case "font":
        if (value === "obsidian" || value === "publisher" || value === "serif" || value === "sans") {
          this.host.updateReaderSettings({ font: value });
        }
        return;
      case "widthMode":
        if (value === "standard" || value === "wide" || value === "full" || value === "edge") {
          this.host.updateReaderSettings({ widthMode: value });
        }
        return;
      case "exportTemplate":
        if (value === "classic" || value === "compact" || value === "callout" || value === "custom") {
          this.host.updateReaderSettings({ exportTemplate: value });
        }
        return;
      case "fontSizePercent":
      case "lineHeight":
      case "letterSpacing":
      case "paragraphSpacing":
      case "pageMargin":
        if (typeof value === "number" && Number.isFinite(value)) this.host.updateReaderSettings({ [key]: value });
        return;
      case "customExportTemplatePath":
        if (typeof value === "string") this.host.updateReaderSettings({ customExportTemplatePath: value });
    }
  }

  display(): void {
    this.renderLegacySettings();
  }

  private renderLegacySettings(): void {
    this.containerEl.empty();
    this.containerEl.addClass("omni-book-reader-settings-page");
    const language = this.host.getReaderSettings().interfaceLanguage;
    const t = (zh: string, en: string): string => uiText(language, zh, en);
    new Setting(this.containerEl)
      .setName(t("界面语言", "Interface language"))
      .setDesc(t("切换 Omni Book Reader 的菜单、阅读器、书架和提示语言。", "Change the language used by Omni Book Reader menus, reader, bookshelf, and notices."))
      .addDropdown((dropdown) => dropdown
        .addOptions({ zh: "中文", en: "English" })
        .setValue(language)
        .onChange((interfaceLanguage) => {
          this.host.updateReaderSettings({ interfaceLanguage: interfaceLanguage as ReaderSettings["interfaceLanguage"] });
          this.renderLegacySettings();
        }));
    new Setting(this.containerEl).setName(t("阅读设置", "Reading settings")).setHeading();
    renderSettings(this.containerEl, this.host, false);
  }
}
