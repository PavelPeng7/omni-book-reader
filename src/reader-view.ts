import "foliate-js/view.js";
import { Overlayer } from "foliate-js/overlayer.js";
import { FootnoteHandler } from "foliate-js/footnotes.js";
import {
  FileView,
  Modal,
  Notice,
  Platform,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import type { AnnotationDocumentInput } from "./annotation-documents";
import { exportChapterMarkdown } from "./chapter-export";
import { copyImageBlob, extensionForBlob, safeFileName, saveBlobToVault, sourceToBlob } from "./media-utils";
import { applyReflowableLayout, resolveViewportWidth } from "./reader-layout";
import { installPublicationSanitizer } from "./sanitizer";
import { SearchSession } from "./search-session";
import { ReaderSettingsModal, type SettingsHost } from "./settings-ui";
import type { ReaderDataStore } from "./store";
import type {
  BookState,
  Bookmark,
  FoliateLocation,
  FoliateSearchItem,
  FoliateSearchResult,
  FoliateTocItem,
  FoliateViewElement,
  HighlightColor,
  HighlightStyle,
  ReaderHighlight,
  ReadingStats,
  ReaderSettings,
} from "./types";
import {
  createId,
  excerptToText,
  formatLanguageValue,
  isEditableTarget,
  isValidCfi,
} from "./utils";

export const EPUB_VIEW_TYPE = "pavel-epub-reader-view";

const HIGHLIGHT_COLORS: Record<HighlightColor, { label: string; value: string }> = {
  yellow: { label: "黄色高亮", value: "#ffd54f" },
  green: { label: "绿色高亮", value: "#81c784" },
  blue: { label: "蓝色高亮", value: "#64b5f6" },
  pink: { label: "粉色高亮", value: "#f48fb1" },
};

const HIGHLIGHT_STYLES: Record<HighlightStyle, { label: string; icon: string }> = {
  highlight: { label: "高亮", icon: "highlighter" },
  underline: { label: "下划线", icon: "underline" },
  strikethrough: { label: "删除线", icon: "strikethrough" },
  squiggly: { label: "波浪线", icon: "waves" },
};

type SidebarTab = "toc" | "search" | "bookmarks" | "highlights";
type AnnotationExportKind = "highlights" | "notes";
type HighlightNoteFilter = "all" | "with-note" | "without-note";
type HighlightDateFilter = "all" | "today" | "7d" | "30d";
type HighlightSort = "newest" | "oldest" | "chapter";

interface PendingSelection {
  cfi: string;
  text: string;
  sectionIndex: number;
  selection: Selection;
}

interface HighlightEdit {
  note: string;
  color: HighlightColor;
  style: HighlightStyle;
  tags: string[];
}

function parseTags(value: string): string[] {
  return Array.from(new Set(value
    .split(/[,，\n]/)
    .map((tag) => tag.replace(/\s+/g, " ").trim().slice(0, 50))
    .filter(Boolean)))
    .slice(0, 20);
}

function annotationFor(highlight: ReaderHighlight): { value: string; color: string; style: HighlightStyle } {
  return {
    value: highlight.cfi,
    color: HIGHLIGHT_COLORS[highlight.color].value,
    style: highlight.style,
  };
}

export interface ReaderPluginHost extends SettingsHost {
  store: ReaderDataStore;
  updateReaderSettings(patch: Partial<ReaderSettings>): void;
  syncAnnotationDocuments(input: AnnotationDocumentInput): Promise<void>;
}

function iconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "pavel-epub-icon-button clickable-icon",
    attr: { type: "button", "aria-label": label, title: label },
  });
  setIcon(button, icon);
  return button;
}

function percentage(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function duration(value: number): string {
  const minutes = Math.max(0, Math.round(value / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} 小时 ${remainder} 分钟` : `${hours} 小时`;
}

class ReadingStatsModal extends Modal {
  constructor(
    app: ReaderPluginHost["app"],
    private readonly stats: ReadingStats,
    private readonly sessionMs: number,
    private readonly onToggleComplete: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("阅读统计");
    const grid = this.contentEl.createDiv({ cls: "pavel-epub-stats-grid" });
    const fraction = this.stats.furthestFraction;
    const estimated = fraction >= 0.02
      ? this.stats.totalReadingMs / fraction * (1 - fraction)
      : 0;
    for (const [label, value] of [
      ["本次阅读", duration(this.sessionMs)],
      ["累计阅读", duration(this.stats.totalReadingMs)],
      ["阅读进度", percentage(fraction)],
      ["预计剩余", estimated ? duration(estimated) : "数据不足"],
      ["完成状态", this.stats.completedAt ? `已完成 · ${new Date(this.stats.completedAt).toLocaleDateString()}` : "阅读中"],
    ]) {
      const item = grid.createDiv({ cls: "pavel-epub-stat-item" });
      item.createDiv({ cls: "pavel-epub-stat-label", text: label });
      item.createDiv({ cls: "pavel-epub-stat-value", text: value });
    }
    const actions = this.contentEl.createDiv({ cls: "pavel-epub-modal-actions" });
    const close = actions.createEl("button", { text: "关闭" });
    const complete = actions.createEl("button", { cls: "mod-cta", text: this.stats.completedAt ? "标记为未完成" : "标记为已完成" });
    close.addEventListener("click", () => this.close());
    complete.addEventListener("click", () => {
      this.onToggleComplete();
      this.close();
    });
  }
}

class HighlightActionsModal extends Modal {
  constructor(
    app: ReaderPluginHost["app"],
    private readonly highlight: ReaderHighlight,
    private readonly onSave: (edit: HighlightEdit) => Promise<void>,
    private readonly onDelete: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("编辑标注");
    this.contentEl.createDiv({ cls: "pavel-epub-highlight-quote", text: this.highlight.text });
    this.contentEl.createDiv({ cls: "pavel-epub-highlight-chapter", text: this.highlight.chapter });
    const label = this.contentEl.createEl("label", { cls: "pavel-epub-note-label", text: "笔记" });
    const textarea = label.createEl("textarea", {
      cls: "pavel-epub-note-input",
      attr: {
        placeholder: "写下对这段高亮的想法…",
        maxlength: "20000",
        rows: "7",
        "aria-label": "高亮笔记",
      },
    });
    textarea.value = this.highlight.note ?? "";
    const options = this.contentEl.createDiv({ cls: "pavel-epub-annotation-options" });
    const colorLabel = options.createEl("label", { text: "颜色" });
    const colorSelect = colorLabel.createEl("select", { attr: { "aria-label": "标注颜色" } });
    for (const [color, definition] of Object.entries(HIGHLIGHT_COLORS) as Array<[HighlightColor, typeof HIGHLIGHT_COLORS[HighlightColor]]>) {
      colorSelect.createEl("option", { text: definition.label, value: color });
    }
    colorSelect.value = this.highlight.color;
    const styleLabel = options.createEl("label", { text: "样式" });
    const styleSelect = styleLabel.createEl("select", { attr: { "aria-label": "标注样式" } });
    for (const [style, definition] of Object.entries(HIGHLIGHT_STYLES) as Array<[HighlightStyle, typeof HIGHLIGHT_STYLES[HighlightStyle]]>) {
      styleSelect.createEl("option", { text: definition.label, value: style });
    }
    styleSelect.value = this.highlight.style;
    const tagsLabel = this.contentEl.createEl("label", { cls: "pavel-epub-note-label", text: "标签" });
    const tagsInput = tagsLabel.createEl("input", {
      cls: "pavel-epub-tags-input",
      type: "text",
      attr: { placeholder: "心理学, 原型, 待读", "aria-label": "标注标签" },
    });
    tagsInput.value = this.highlight.tags.join(", ");
    this.contentEl.createDiv({ cls: "pavel-epub-note-hint", text: "清空并保存可移除笔记；高亮原文仍会保留。" });
    const actions = this.contentEl.createDiv({ cls: "pavel-epub-modal-actions" });
    const cancel = actions.createEl("button", { text: "关闭" });
    const remove = actions.createEl("button", { cls: "mod-warning", text: "删除高亮" });
    const save = actions.createEl("button", { cls: "mod-cta", text: "保存笔记" });
    cancel.addEventListener("click", () => this.close());
    remove.addEventListener("click", () => {
      void this.runAction([cancel, remove, save], async () => this.onDelete());
    });
    save.addEventListener("click", () => {
      void this.runAction([cancel, remove, save], async () => this.onSave({
        note: textarea.value,
        color: colorSelect.value as HighlightColor,
        style: styleSelect.value as HighlightStyle,
        tags: parseTags(tagsInput.value),
      }));
    });
    window.setTimeout(() => textarea.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async runAction(buttons: HTMLButtonElement[], action: () => Promise<void>): Promise<void> {
    for (const button of buttons) button.disabled = true;
    try {
      await action();
      this.close();
    } catch (error) {
      console.error("[OmniReader] Highlight action failed", error);
      new Notice(error instanceof Error ? error.message : "保存高亮笔记失败");
      for (const button of buttons) button.disabled = false;
    }
  }
}

class FootnotePreviewModal extends Modal {
  constructor(
    app: ReaderPluginHost["app"],
    private readonly preview: FoliateViewElement,
    private readonly href: string,
    private readonly onNavigate: (href: string) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("脚注预览");
    const host = this.contentEl.createDiv({ cls: "pavel-epub-footnote-preview" });
    host.appendChild(this.preview);
    const actions = this.contentEl.createDiv({ cls: "pavel-epub-modal-actions" });
    const close = actions.createEl("button", { text: "关闭" });
    const navigate = actions.createEl("button", { cls: "mod-cta", text: "跳转到正文位置" });
    close.addEventListener("click", () => this.close());
    navigate.addEventListener("click", () => {
      void this.onNavigate(this.href).then(() => this.close());
    });
  }

  onClose(): void {
    try { this.preview.close(); } catch { /* Preview may not have completed loading. */ }
    this.preview.remove();
    this.contentEl.empty();
  }
}

class ImagePreviewModal extends Modal {
  private blobPromise: Promise<Blob> | null = null;

  constructor(
    app: ReaderPluginHost["app"],
    private readonly source: string,
    private readonly alt: string,
    private readonly onSave: (blob: Blob) => Promise<string>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.alt || "书内图片");
    const viewport = this.contentEl.createDiv({ cls: "pavel-epub-image-preview" });
    const image = viewport.createEl("img", { attr: { src: this.source, alt: this.alt || "书内图片" } });
    const controls = this.contentEl.createDiv({ cls: "pavel-epub-image-controls" });
    controls.createSpan({ text: "缩放" });
    const zoom = controls.createEl("input", { type: "range", attr: { min: "50", max: "400", value: "100", step: "10", "aria-label": "图片缩放" } });
    const zoomText = controls.createSpan({ text: "100%" });
    zoom.addEventListener("input", () => {
      const value = Number(zoom.value);
      image.style.width = `${value}%`;
      zoomText.setText(`${value}%`);
    });
    const actions = this.contentEl.createDiv({ cls: "pavel-epub-modal-actions" });
    const close = actions.createEl("button", { text: "关闭" });
    const copy = actions.createEl("button", { text: "复制图片" });
    const save = actions.createEl("button", { cls: "mod-cta", text: "保存到 Vault" });
    close.addEventListener("click", () => this.close());
    copy.addEventListener("click", () => void this.run(copy, async () => {
      await copyImageBlob(await this.getBlob());
      new Notice("图片已复制到剪贴板");
    }));
    save.addEventListener("click", () => void this.run(save, async () => {
      const path = await this.onSave(await this.getBlob());
      new Notice(`图片已保存：${path}`);
    }));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private getBlob(): Promise<Blob> {
    this.blobPromise ??= sourceToBlob(this.source);
    return this.blobPromise;
  }

  private async run(button: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
    button.disabled = true;
    try { await action(); }
    catch (error) { new Notice(error instanceof Error ? error.message : "图片操作失败"); }
    finally { button.disabled = false; }
  }
}

export class PavelEpubReaderView extends FileView {
  private rootEl: HTMLElement | null = null;
  private sidebarEl: HTMLElement | null = null;
  private sidebarBackdropEl: HTMLElement | null = null;
  private viewerEl: HTMLElement | null = null;
  private readingAreaEl: HTMLElement | null = null;
  private loadingEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private chapterEl: HTMLElement | null = null;
  private progressEl: HTMLInputElement | null = null;
  private progressTextEl: HTMLElement | null = null;
  private locationTextEl: HTMLElement | null = null;
  private immersiveLocationEl: HTMLElement | null = null;
  private readingStatsEl: HTMLElement | null = null;
  private bookmarkButton: HTMLButtonElement | null = null;
  private focusButton: HTMLButtonElement | null = null;
  private selectionToolbarEl: HTMLElement | null = null;
  private searchInputEl: HTMLInputElement | null = null;
  private searchStatusEl: HTMLElement | null = null;
  private searchResultsEl: HTMLElement | null = null;
  private tocPanelEl: HTMLElement | null = null;
  private bookmarkPanelEl: HTMLElement | null = null;
  private highlightPanelEl: HTMLElement | null = null;
  private tabButtons = new Map<SidebarTab, HTMLButtonElement>();
  private tabPanels = new Map<SidebarTab, HTMLElement>();
  private tocLinks = new Map<string, HTMLButtonElement>();
  private reader: FoliateViewElement | null = null;
  private bookState: BookState | null = null;
  private currentLocation: FoliateLocation = {};
  private pendingSelection: PendingSelection | null = null;
  private selectedHighlightStyle: HighlightStyle = "highlight";
  private highlightTagFilter = "";
  private highlightChapterFilter = "";
  private highlightColorFilter: HighlightColor | "" = "";
  private highlightNoteFilter: HighlightNoteFilter = "all";
  private highlightDateFilter: HighlightDateFilter = "all";
  private highlightSort: HighlightSort = "newest";
  private sidebarOpen = !Platform.isMobile;
  private activeTab: SidebarTab = "toc";
  private searchTimer: number | null = null;
  private progressTimer: number | null = null;
  private statsTimer: number | null = null;
  private statsLastTick = 0;
  private statsLastActivity = 0;
  private sessionReadingMs = 0;
  private focusMode = false;
  private sidebarOpenBeforeFocus = false;
  private loadGeneration = 0;
  private cleanupCallbacks: Array<() => void> = [];
  private searchSession = new SearchSession();
  private themeObserver: MutationObserver | null = null;
  private layoutObserver: ResizeObserver | null = null;
  private layoutFrame: number | null = null;
  private wheelDelta = 0;
  private lastWheelTurnAt = 0;
  private bookTitle = "OmniReader";
  private bookAuthor = "";
  private fixedLayout = false;
  private loadedFileKey = "";

  constructor(leaf: WorkspaceLeaf, private readonly plugin: ReaderPluginHost) {
    super(leaf);
    this.navigation = true;
  }

  getViewType(): string {
    return EPUB_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.bookTitle || this.file?.basename || "OmniReader";
  }

  getIcon(): string {
    return "book-open";
  }

  canAcceptExtension(extension: string): boolean {
    return extension.toLowerCase() === "epub";
  }

  async onOpen(): Promise<void> {
    this.buildShell();
    this.registerDomEvent(document, "keydown", (event: KeyboardEvent) => this.handleMobileHardwareKey(event), true);
    this.themeObserver = new MutationObserver(() => this.applySettings());
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (this.file) await this.loadBook(this.file);
  }

  async onLoadFile(file: TFile): Promise<void> {
    if (!this.rootEl) this.buildShell();
    await this.loadBook(file);
  }

  async onUnloadFile(_file: TFile): Promise<void> {
    await this.cleanupReader();
  }

  async onClose(): Promise<void> {
    this.themeObserver?.disconnect();
    this.themeObserver = null;
    this.layoutObserver?.disconnect();
    this.layoutObserver = null;
    if (this.layoutFrame !== null) window.cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = null;
    await this.cleanupReader();
    await this.plugin.store.flush();
    this.contentEl.empty();
    this.rootEl = null;
  }

  applySettings(): void {
    const settings = this.plugin.getReaderSettings();
    this.rootEl?.setAttribute("data-reader-theme", settings.theme);
    if (!this.reader) return;
    const renderer = this.reader.renderer;
    if (!renderer) return;
    const viewportWidth = resolveViewportWidth(
      this.readingAreaEl?.getBoundingClientRect().width ?? 0,
      this.viewerEl?.getBoundingClientRect().width ?? 0,
      Boolean(this.rootEl?.hasClass("is-compact-reading-area")),
    );
    if (viewportWidth) {
      this.reader.style.width = `${viewportWidth}px`;
      this.reader.style.maxWidth = "100%";
      this.reader.style.minWidth = "0";
      renderer.style.width = "100%";
      renderer.style.maxWidth = "100%";
      renderer.style.minWidth = "0";
    }
    if (!this.fixedLayout) {
      applyReflowableLayout(renderer, settings, viewportWidth);
    }
  }

  toggleSidebar(): void {
    this.setSidebarOpen(!this.sidebarOpen);
  }

  toggleBookmark(): void {
    if (!this.bookState || !this.currentLocation.cfi) {
      new Notice("当前还没有可保存的阅读位置");
      return;
    }
    const index = this.bookState.bookmarks.findIndex((item) => item.cfi === this.currentLocation.cfi);
    if (index >= 0) {
      this.bookState.bookmarks.splice(index, 1);
      new Notice("已移除当前位置书签");
    } else {
      this.bookState.bookmarks.unshift({
        id: createId("bookmark"),
        cfi: this.currentLocation.cfi,
        fraction: this.currentLocation.fraction ?? 0,
        chapter: this.currentChapter(),
        createdAt: Date.now(),
      });
      new Notice("已添加书签");
    }
    this.plugin.store.markChanged(0);
    this.renderBookmarks();
    this.updateBookmarkButton();
  }

  async exportAnnotations(kind: AnnotationExportKind): Promise<void> {
    if (!this.bookState || !this.file) {
      new Notice("请先打开一本 EPUB");
      return;
    }
    const highlights = this.bookState.highlights;
    if (kind === "highlights" && !highlights.length) {
      new Notice("当前书籍还没有可导出的高亮摘抄");
      return;
    }
    if (kind === "notes" && !highlights.some((highlight) => Boolean(highlight.note?.trim()))) {
      new Notice("当前书籍还没有可导出的笔记");
      return;
    }
    if (!await this.syncAnnotationDocuments()) return;
    const documents = this.bookState.annotationDocuments;
    const path = kind === "highlights" ? documents?.highlightPath : documents?.notePath;
    if (!path) {
      new Notice("没有找到导出文档路径");
      return;
    }
    this.openAnnotationDocument(path);
    new Notice(kind === "highlights" ? "高亮摘抄已导出" : "笔记已导出");
  }

  async navigateToCfi(cfi: string): Promise<void> {
    if (!this.reader || !isValidCfi(cfi)) {
      new Notice("无法打开该 EPUB 标注位置");
      return;
    }
    if (!this.reader.resolveNavigation(cfi)) {
      new Notice("该 CFI 位置已经失效");
      return;
    }
    await this.reader.select(cfi);
  }

  private buildShell(): void {
    this.contentEl.empty();
    this.contentEl.addClass("pavel-epub-view-content");
    const root = this.contentEl.createDiv({ cls: "pavel-epub-reader" });
    this.rootEl = root;

    const header = root.createDiv({ cls: "pavel-epub-header" });
    const sidebarToggle = iconButton(header, "panel-left", "切换阅读侧栏");
    sidebarToggle.addEventListener("click", () => this.toggleSidebar());
    const headings = header.createDiv({ cls: "pavel-epub-headings" });
    this.titleEl = headings.createDiv({ cls: "pavel-epub-title", text: "OmniReader" });
    this.chapterEl = headings.createDiv({ cls: "pavel-epub-chapter", text: "准备打开书籍" });
    const headerActions = header.createDiv({ cls: "pavel-epub-header-actions" });
    const search = iconButton(headerActions, "search", "搜索当前书籍");
    search.addEventListener("click", () => {
      this.activateTab("search");
      this.setSidebarOpen(true);
      window.setTimeout(() => this.searchInputEl?.focus(), 0);
    });
    this.bookmarkButton = iconButton(headerActions, "bookmark", "添加或移除当前位置书签");
    this.bookmarkButton.addEventListener("click", () => this.toggleBookmark());
    const exportChapter = iconButton(headerActions, "file-down", "导出当前章节 Markdown");
    exportChapter.addEventListener("click", () => void this.exportCurrentChapter());
    const stats = iconButton(headerActions, "chart-no-axes-column-increasing", "阅读统计");
    stats.addEventListener("click", () => this.openReadingStats());
    this.focusButton = iconButton(headerActions, "maximize", "沉浸式阅读");
    this.focusButton.addEventListener("click", () => this.toggleFocusMode());
    const settings = iconButton(headerActions, "settings-2", "阅读设置");
    settings.addEventListener("click", () => new ReaderSettingsModal(this.app, this.plugin, this.fixedLayout).open());

    const body = root.createDiv({ cls: "pavel-epub-body" });
    this.sidebarEl = this.buildSidebar(body);
    this.sidebarBackdropEl = body.createDiv({ cls: "pavel-epub-sidebar-backdrop" });
    this.sidebarBackdropEl.addEventListener("click", () => this.setSidebarOpen(false));

    const readingArea = body.createDiv({ cls: "pavel-epub-reading-area" });
    this.readingAreaEl = readingArea;
    const previous = iconButton(readingArea, "chevron-left", "上一页");
    previous.addClass("pavel-epub-page-button", "is-previous");
    previous.addEventListener("click", () => void this.reader?.goLeft());
    this.viewerEl = readingArea.createDiv({ cls: "pavel-epub-viewer" });
    this.loadingEl = this.viewerEl.createDiv({ cls: "pavel-epub-loading", text: "正在加载 EPUB…" });
    const next = iconButton(readingArea, "chevron-right", "下一页");
    next.addClass("pavel-epub-page-button", "is-next");
    next.addEventListener("click", () => void this.reader?.goRight());

    const immersiveExit = readingArea.createEl("button", {
      cls: "pavel-epub-immersive-exit",
      text: "退出沉浸式阅读",
      attr: { type: "button", "aria-label": "退出沉浸式阅读" },
    });
    setIcon(immersiveExit.createSpan({ cls: "pavel-epub-immersive-exit-icon" }), "minimize");
    immersiveExit.addEventListener("click", () => this.toggleFocusMode(false));
    const immersiveFooter = readingArea.createDiv({ cls: "pavel-epub-immersive-footer", attr: { "aria-label": "沉浸式阅读翻页" } });
    const immersivePrevious = immersiveFooter.createEl("button", { text: "← 上一页", attr: { type: "button" } });
    immersivePrevious.addEventListener("click", () => void this.reader?.goLeft());
    this.immersiveLocationEl = immersiveFooter.createSpan({ text: "正在定位" });
    const immersiveNext = immersiveFooter.createEl("button", { text: "下一页 →", attr: { type: "button" } });
    immersiveNext.addEventListener("click", () => void this.reader?.goRight());

    const footer = root.createDiv({ cls: "pavel-epub-footer" });
    this.progressTextEl = footer.createSpan({ cls: "pavel-epub-progress-text", text: "0%" });
    this.progressEl = footer.createEl("input", {
      cls: "pavel-epub-progress",
      type: "range",
      attr: { min: "0", max: "1", step: "0.001", value: "0", "aria-label": "阅读进度" },
    });
    this.progressEl.addEventListener("input", () => {
      if (this.progressEl && this.progressTextEl) this.progressTextEl.setText(percentage(Number(this.progressEl.value)));
    });
    this.progressEl.addEventListener("change", () => {
      const value = Number(this.progressEl?.value ?? 0);
      void this.reader?.goToFraction(value);
    });
    this.locationTextEl = footer.createSpan({ cls: "pavel-epub-location", text: "尚未定位" });
    this.readingStatsEl = footer.createSpan({ cls: "pavel-epub-reading-stats", text: "本次 0 分钟" });

    this.selectionToolbarEl = root.createDiv({ cls: "pavel-epub-selection-toolbar" });
    this.selectionToolbarEl.setAttribute("role", "toolbar");
    this.selectionToolbarEl.setAttribute("aria-label", "标注样式和颜色");
    const styleButtons = new Map<HighlightStyle, HTMLButtonElement>();
    for (const [style, definition] of Object.entries(HIGHLIGHT_STYLES) as Array<[HighlightStyle, typeof HIGHLIGHT_STYLES[HighlightStyle]]>) {
      const button = iconButton(this.selectionToolbarEl, definition.icon, definition.label);
      button.addClass("pavel-epub-style-button");
      button.toggleClass("is-active", style === this.selectedHighlightStyle);
      button.addEventListener("click", () => {
        this.selectedHighlightStyle = style;
        for (const [key, candidate] of styleButtons) candidate.toggleClass("is-active", key === style);
      });
      styleButtons.set(style, button);
    }
    this.selectionToolbarEl.createDiv({ cls: "pavel-epub-toolbar-divider" });
    for (const [color, definition] of Object.entries(HIGHLIGHT_COLORS) as Array<[HighlightColor, typeof HIGHLIGHT_COLORS[HighlightColor]]>) {
      const button = this.selectionToolbarEl.createEl("button", {
        cls: `pavel-epub-color-button is-${color}`,
        attr: { type: "button", "aria-label": definition.label, title: definition.label },
      });
      button.addEventListener("click", () => void this.commitHighlight(color, this.selectedHighlightStyle));
    }
    const cancelSelection = iconButton(this.selectionToolbarEl, "x", "取消高亮");
    cancelSelection.addEventListener("click", () => this.clearPendingSelection());

    root.addEventListener("keydown", (event) => this.handleKeydown(event));
    root.addEventListener("pointerdown", () => this.noteReadingActivity());
    readingArea.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });
    this.layoutObserver?.disconnect();
    this.layoutObserver = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? readingArea.clientWidth;
      root.toggleClass("is-compact-reading-area", width > 0 && width < 820);
      if (this.layoutFrame !== null) return;
      this.layoutFrame = window.requestAnimationFrame(() => {
        this.layoutFrame = null;
        this.applySettings();
      });
    });
    this.layoutObserver.observe(readingArea);
    this.setSidebarOpen(this.sidebarOpen);
    this.activateTab(this.activeTab);
    this.applySettings();
  }

  private buildSidebar(parent: HTMLElement): HTMLElement {
    const sidebar = parent.createEl("aside", { cls: "pavel-epub-sidebar", attr: { "aria-label": "OmniReader 阅读侧栏" } });
    const tabs = sidebar.createDiv({ cls: "pavel-epub-tabs", attr: { role: "tablist" } });
    const definitions: Array<[SidebarTab, string, string]> = [
      ["toc", "list-tree", "目录"],
      ["search", "search", "搜索"],
      ["bookmarks", "bookmark", "书签"],
      ["highlights", "highlighter", "高亮"],
    ];
    for (const [tab, icon, label] of definitions) {
      const button = iconButton(tabs, icon, label);
      button.addClass("pavel-epub-tab");
      button.setAttribute("role", "tab");
      button.addEventListener("click", () => this.activateTab(tab));
      this.tabButtons.set(tab, button);
    }
    const closeSidebar = iconButton(tabs, "panel-left-close", "隐藏侧栏");
    closeSidebar.addClass("pavel-epub-sidebar-close");
    closeSidebar.addEventListener("click", () => this.setSidebarOpen(false));

    const panels = sidebar.createDiv({ cls: "pavel-epub-panels" });
    this.tocPanelEl = this.createPanel(panels, "toc");
    const searchPanel = this.createPanel(panels, "search");
    const searchBox = searchPanel.createDiv({ cls: "pavel-epub-search-box" });
    this.searchInputEl = searchBox.createEl("input", {
      type: "search",
      attr: { placeholder: "搜索当前书籍…", "aria-label": "搜索当前书籍" },
    });
    this.searchInputEl.addEventListener("input", () => this.scheduleSearch());
    this.searchStatusEl = searchPanel.createDiv({ cls: "pavel-epub-search-status", text: "输入关键词开始搜索" });
    this.searchResultsEl = searchPanel.createDiv({ cls: "pavel-epub-search-results" });
    this.bookmarkPanelEl = this.createPanel(panels, "bookmarks");
    this.highlightPanelEl = this.createPanel(panels, "highlights");
    return sidebar;
  }

  private createPanel(parent: HTMLElement, tab: SidebarTab): HTMLElement {
    const panel = parent.createDiv({ cls: "pavel-epub-panel", attr: { role: "tabpanel" } });
    panel.dataset.tab = tab;
    this.tabPanels.set(tab, panel);
    return panel;
  }

  private async loadBook(file: TFile): Promise<void> {
    const fileKey = `${file.path}:${file.stat.size}:${file.stat.mtime}`;
    if (this.reader && this.loadedFileKey === fileKey) return;
    const generation = ++this.loadGeneration;
    await this.cleanupReader(false);
    if (generation !== this.loadGeneration || !this.viewerEl) return;
    this.showLoading("正在读取 EPUB…");

    try {
      const binary = await this.app.vault.readBinary(file);
      if (generation !== this.loadGeneration) return;
      const source = new File([binary], file.name, {
        type: "application/epub+zip",
        lastModified: file.stat.mtime,
      });
      const reader = document.createElement("foliate-view") as FoliateViewElement;
      reader.addClass("pavel-epub-foliate-view");
      this.viewerEl.empty();
      this.viewerEl.append(reader);
      this.reader = reader;
      this.attachReaderEvents(reader);
      await reader.open(source);
      if (generation !== this.loadGeneration) return;

      this.cleanupCallbacks.push(installPublicationSanitizer(reader.book.transformTarget));
      this.fixedLayout = Boolean(reader.isFixedLayout || reader.book.rendition?.layout === "pre-paginated");
      this.bookState = this.plugin.store.ensureBook(file.path, { size: file.stat.size, mtime: file.stat.mtime });
      this.startReadingStats();
      this.bookTitle = formatLanguageValue(reader.book.metadata?.title) || file.basename;
      this.bookAuthor = formatLanguageValue(reader.book.metadata?.author);
      this.titleEl?.setText(this.bookTitle);
      this.chapterEl?.setText("正在定位…");
      this.renderToc(reader.book.toc ?? []);
      this.renderBookmarks();
      this.renderHighlights();
      this.applySettings();
      if (this.bookState.highlights.length || this.bookState.annotationDocuments) {
        await this.syncAnnotationDocuments();
        this.renderHighlights();
      }

      await this.restorePosition(reader, this.bookState);
      if (generation !== this.loadGeneration) return;
      this.loadedFileKey = fileKey;
      this.hideLoading();
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      console.error("[OmniReader] Failed to open book", error);
      this.showLoadError(file, error);
    }
  }

  private attachReaderEvents(reader: FoliateViewElement): void {
    const footnotes = new FootnoteHandler();
    const onRelocate = (event: Event): void => this.onRelocate((event as CustomEvent<FoliateLocation>).detail);
    const onLoad = (event: Event): void => {
      const detail = (event as CustomEvent<{ doc: Document; index: number }>).detail;
      this.attachDocumentEvents(detail.doc, detail.index);
    };
    const onCreateOverlay = (event: Event): void => {
      const index = (event as CustomEvent<{ index: number }>).detail.index;
      for (const highlight of this.bookState?.highlights.filter((item) => item.sectionIndex === index && !item.stale) ?? []) {
        void reader.addAnnotation(annotationFor(highlight)).catch((error) => {
          console.warn("[OmniReader] Stored highlight could not be restored", error);
          highlight.stale = true;
          this.plugin.store.markChanged(0);
          this.renderHighlights();
        });
      }
    };
    const onDrawAnnotation = (event: Event): void => {
      const detail = (event as CustomEvent<{
        draw: (renderer: typeof Overlayer.highlight, options: { color: string }) => void;
        annotation: { color?: string; style?: HighlightStyle };
      }>).detail;
      const renderers: Record<HighlightStyle, typeof Overlayer.highlight> = {
        highlight: Overlayer.highlight,
        underline: Overlayer.underline,
        strikethrough: Overlayer.strikethrough,
        squiggly: Overlayer.squiggly,
      };
      detail.draw(renderers[detail.annotation.style ?? "highlight"], {
        color: detail.annotation.color ?? HIGHLIGHT_COLORS.yellow.value,
      });
    };
    const onShowAnnotation = (event: Event): void => {
      const value = (event as CustomEvent<{ value: string }>).detail.value;
      const highlight = this.bookState?.highlights.find((item) => item.cfi === value);
      if (highlight) this.openHighlightActions(highlight);
    };
    const onExternalLink = (event: Event): void => {
      event.preventDefault();
      const detail = (event as CustomEvent<{ href_?: string; a?: HTMLAnchorElement }>).detail;
      const href = detail.href_ ?? detail.a?.href;
      if (href && this.file) void this.app.workspace.openLinkText(href, this.file.path, true);
    };
    const onLink = (event: Event): void => {
      void Promise.resolve(footnotes.handle(reader.book, event)).catch((error) => {
        console.warn("[OmniReader] Could not preview footnote", error);
      });
    };
    const onFootnoteRender = (event: Event): void => {
      const detail = (event as CustomEvent<{ view: FoliateViewElement; href: string }>).detail;
      new FootnotePreviewModal(this.app, detail.view, detail.href, async (href) => {
        await reader.goTo(href);
      }).open();
    };

    reader.addEventListener("relocate", onRelocate);
    reader.addEventListener("load", onLoad);
    reader.addEventListener("create-overlay", onCreateOverlay);
    reader.addEventListener("draw-annotation", onDrawAnnotation);
    reader.addEventListener("show-annotation", onShowAnnotation);
    reader.addEventListener("external-link", onExternalLink);
    reader.addEventListener("link", onLink);
    footnotes.addEventListener("render", onFootnoteRender);
    this.cleanupCallbacks.push(() => {
      reader.removeEventListener("relocate", onRelocate);
      reader.removeEventListener("load", onLoad);
      reader.removeEventListener("create-overlay", onCreateOverlay);
      reader.removeEventListener("draw-annotation", onDrawAnnotation);
      reader.removeEventListener("show-annotation", onShowAnnotation);
      reader.removeEventListener("external-link", onExternalLink);
      reader.removeEventListener("link", onLink);
      footnotes.removeEventListener("render", onFootnoteRender);
    });
  }

  private async restorePosition(reader: FoliateViewElement, state: BookState): Promise<void> {
    if (!state.position) {
      await reader.init({ showTextStart: true });
      return;
    }
    try {
      if (!reader.resolveNavigation(state.position.cfi)) throw new Error("Stored CFI cannot be resolved");
      await reader.init({ lastLocation: state.position.cfi, showTextStart: false });
    } catch (error) {
      console.warn("[OmniReader] Stored CFI could not be restored", error);
      new Notice("原阅读位置已失效，正在按进度恢复");
      try {
        await reader.goToFraction(state.position.fraction);
      } catch {
        await reader.init({ showTextStart: true });
      }
    }
  }

  private attachDocumentEvents(document: Document, sectionIndex: number): void {
    const pointerUp = (): void => {
      this.noteReadingActivity();
      window.setTimeout(() => this.captureSelection(document, sectionIndex), 0);
    };
    const keyUp = (event: KeyboardEvent): void => {
      this.noteReadingActivity();
      this.handleKeydown(event);
      window.setTimeout(() => this.captureSelection(document, sectionIndex), 0);
    };
    const wheel = (event: WheelEvent): void => this.handleWheel(event);
    const click = (event: MouseEvent): void => {
      const target = event.target as Element | null;
      const image = target?.closest?.("img");
      if (!image) return;
      const imageElement = image as HTMLImageElement;
      const source = imageElement.currentSrc || imageElement.src || image.getAttribute("src") || "";
      if (!source.startsWith("blob:") && !source.startsWith("data:")) return;
      event.preventDefault();
      event.stopPropagation();
      this.openImagePreview(source, image.getAttribute("alt") ?? "");
    };
    document.addEventListener("pointerup", pointerUp);
    document.addEventListener("keyup", keyUp);
    document.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("click", click, true);
    this.cleanupCallbacks.push(() => {
      document.removeEventListener("pointerup", pointerUp);
      document.removeEventListener("keyup", keyUp);
      document.removeEventListener("wheel", wheel);
      document.removeEventListener("click", click, true);
    });
  }

  async exportCurrentChapter(): Promise<void> {
    if (!this.reader || !this.file || !this.bookState) {
      new Notice("请先打开一本 EPUB");
      return;
    }
    const resolvedIndex = this.currentLocation.cfi
      ? this.reader.resolveNavigation(this.currentLocation.cfi)?.index
      : undefined;
    const contents = this.reader.renderer.getContents?.() ?? [];
    const content = contents.find((item) => item.index === resolvedIndex) ?? contents[0];
    if (!content) {
      new Notice("当前章节尚未加载完成");
      return;
    }
    try {
      const path = await exportChapterMarkdown({
        vault: this.app.vault,
        sourceFile: this.file,
        document: content.doc,
        sectionIndex: content.index,
        chapter: this.currentChapter(),
        bookTitle: this.bookTitle,
        author: this.bookAuthor,
        vaultName: this.app.vault.getName(),
        highlights: this.bookState.highlights,
      });
      await this.app.workspace.openLinkText(path, this.file.path, false);
      new Notice("当前章节已导出为 Markdown");
    } catch (error) {
      console.error("[OmniReader] Chapter export failed", error);
      new Notice(error instanceof Error ? `章节导出失败：${error.message}` : "章节导出失败");
    }
  }

  private openImagePreview(source: string, alt: string): void {
    if (!this.file) return;
    new ImagePreviewModal(this.app, source, alt, async (blob) => {
      const parent = this.file?.parent?.path ?? "";
      const folder = `${parent}/${this.file?.basename ?? "EPUB"}/图片`;
      const base = safeFileName(alt || `${this.currentChapter()}-${Date.now()}`, "书内图片");
      const extension = extensionForBlob(blob, source);
      let path = `${folder}/${base}.${extension}`;
      let suffix = 2;
      while (this.app.vault.getAbstractFileByPath(path)) {
        path = `${folder}/${base}-${suffix}.${extension}`;
        suffix += 1;
      }
      await saveBlobToVault(this.app.vault, path, blob);
      return path;
    }).open();
  }

  toggleFocusMode(force?: boolean): void {
    const enabled = force ?? !this.focusMode;
    if (enabled === this.focusMode) return;
    this.focusMode = enabled;
    this.rootEl?.toggleClass("is-focus-mode", enabled);
    this.focusButton?.toggleClass("is-active", enabled);
    if (!enabled) {
      this.setSidebarOpen(this.sidebarOpenBeforeFocus);
      return;
    }
    this.sidebarOpenBeforeFocus = this.sidebarOpen;
    this.setSidebarOpen(false);
  }

  private captureSelection(document: Document, sectionIndex: number): void {
    if (!this.reader) return;
    const selection = document.defaultView?.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      this.clearPendingSelection(false);
      return;
    }
    const text = selection.toString().replace(/\s+/g, " ").trim();
    if (!text) return;
    if (text.length > 10000) {
      new Notice("单次高亮不能超过 10,000 个字符");
      this.clearPendingSelection();
      return;
    }
    try {
      const range = selection.getRangeAt(0).cloneRange();
      const cfi = this.reader.getCFI(sectionIndex, range);
      this.pendingSelection = { cfi, text, sectionIndex, selection };
      this.selectionToolbarEl?.addClass("is-visible");
    } catch (error) {
      console.warn("[OmniReader] Could not create CFI for selection", error);
      this.clearPendingSelection();
    }
  }

  private async commitHighlight(color: HighlightColor, style: HighlightStyle): Promise<void> {
    if (!this.pendingSelection || !this.bookState || !this.reader) return;
    const pending = this.pendingSelection;
    const existing = this.bookState.highlights.find((item) => item.cfi === pending.cfi);
    if (existing) {
      existing.color = color;
      existing.style = style;
      existing.text = pending.text;
      await this.reader.deleteAnnotation({ value: existing.cfi });
      await this.reader.addAnnotation(annotationFor(existing));
    } else {
      const highlight: ReaderHighlight = {
        id: createId("highlight"),
        cfi: pending.cfi,
        text: pending.text,
        chapter: this.currentChapter(),
        color,
        style,
        tags: [],
        sectionIndex: pending.sectionIndex,
        createdAt: Date.now(),
      };
      this.bookState.highlights.unshift(highlight);
      await this.reader.addAnnotation(annotationFor(highlight));
    }
    this.plugin.store.markChanged(0);
    await this.syncAnnotationDocuments();
    this.renderHighlights();
    this.clearPendingSelection();
  }

  private async deleteHighlight(highlight: ReaderHighlight): Promise<void> {
    if (!this.bookState) return;
    const index = this.bookState.highlights.findIndex((item) => item.id === highlight.id);
    if (index < 0) return;
    this.bookState.highlights.splice(index, 1);
    await this.reader?.deleteAnnotation({ value: highlight.cfi });
    this.plugin.store.markChanged(0);
    await this.syncAnnotationDocuments();
    this.renderHighlights();
    new Notice("已删除高亮");
  }

  private openHighlightActions(highlight: ReaderHighlight): void {
    new HighlightActionsModal(
      this.app,
      highlight,
      async (edit) => this.saveHighlightEdit(highlight, edit),
      async () => this.deleteHighlight(highlight),
    ).open();
  }

  private async saveHighlightEdit(highlight: ReaderHighlight, edit: HighlightEdit): Promise<void> {
    const note = edit.note.replace(/\r\n?/g, "\n").trim();
    if (note.length > 20000) throw new Error("单条笔记不能超过 20,000 个字符");
    const appearanceChanged = highlight.color !== edit.color || highlight.style !== edit.style;
    highlight.color = edit.color;
    highlight.style = edit.style;
    highlight.tags = edit.tags;
    if (note) {
      highlight.note = note;
      highlight.noteUpdatedAt = Date.now();
    } else {
      delete highlight.note;
      delete highlight.noteUpdatedAt;
    }
    if (appearanceChanged && this.reader) {
      await this.reader.deleteAnnotation({ value: highlight.cfi });
      await this.reader.addAnnotation(annotationFor(highlight));
    }
    this.plugin.store.markChanged(0);
    await this.syncAnnotationDocuments();
    this.renderHighlights();
    new Notice(note ? "标注与笔记已保存" : "标注已保存");
  }

  private async syncAnnotationDocuments(): Promise<boolean> {
    if (!this.file || !this.bookState) return false;
    try {
      await this.plugin.syncAnnotationDocuments({
        sourceFile: this.file,
        state: this.bookState,
        title: this.bookTitle,
        author: this.bookAuthor,
      });
      this.plugin.store.markChanged(0);
      return true;
    } catch (error) {
      console.error("[OmniReader] Could not sync annotation documents", error);
      new Notice(error instanceof Error ? `无法同步高亮与笔记文档：${error.message}` : "无法同步高亮与笔记文档");
      return false;
    }
  }

  private clearPendingSelection(clearNative = true): void {
    if (clearNative) {
      try {
        this.pendingSelection?.selection.removeAllRanges();
        this.reader?.deselect();
      } catch {
        // The iframe may already have been unloaded.
      }
    }
    this.pendingSelection = null;
    this.selectionToolbarEl?.removeClass("is-visible");
  }

  private onRelocate(location: FoliateLocation): void {
    this.noteReadingActivity();
    this.currentLocation = location ?? {};
    const fraction = location.fraction ?? 0;
    if (this.progressEl) this.progressEl.value = String(fraction);
    this.progressTextEl?.setText(percentage(fraction));
    const chapter = this.currentChapter();
    this.chapterEl?.setText(chapter);
    const page = formatLanguageValue(location.pageItem?.label);
    const loc = location.location?.current;
    const total = location.location?.total;
    const locationText = page ? `第 ${page} 页` : loc && total ? `第 ${loc} / ${total} 页` : loc ? `位置 ${loc}` : "";
    this.locationTextEl?.setText(locationText);
    this.immersiveLocationEl?.setText(locationText || "正在定位");
    this.updateCurrentToc(location.tocItem?.href);
    this.updateBookmarkButton();

    if (this.bookState?.readingStats) {
      this.bookState.readingStats.furthestFraction = Math.max(this.bookState.readingStats.furthestFraction, fraction);
      if (fraction >= 0.98 && !this.bookState.readingStats.completedAt) this.bookState.readingStats.completedAt = Date.now();
      this.updateReadingStatsText();
    }

    if (!this.bookState || !location.cfi) return;
    if (this.progressTimer !== null) window.clearTimeout(this.progressTimer);
    this.progressTimer = window.setTimeout(() => {
      this.progressTimer = null;
      this.saveCurrentPosition();
    }, 500);
  }

  private saveCurrentPosition(): void {
    if (!this.bookState || !this.currentLocation.cfi) return;
    this.bookState.position = {
      cfi: this.currentLocation.cfi,
      fraction: this.currentLocation.fraction ?? 0,
      updatedAt: Date.now(),
    };
    this.plugin.store.markChanged(0);
  }

  private currentChapter(): string {
    return formatLanguageValue(this.currentLocation.tocItem?.label) || "未命名章节";
  }

  private startReadingStats(): void {
    if (!this.bookState) return;
    const now = Date.now();
    this.bookState.readingStats ??= {
      totalReadingMs: 0,
      lastOpenedAt: now,
      lastReadAt: now,
      furthestFraction: this.bookState.position?.fraction ?? 0,
    };
    this.bookState.readingStats.lastOpenedAt = now;
    this.statsLastTick = now;
    this.statsLastActivity = now;
    this.sessionReadingMs = 0;
    if (this.statsTimer !== null) window.clearInterval(this.statsTimer);
    this.statsTimer = window.setInterval(() => this.tickReadingStats(), 15000);
    this.plugin.store.markChanged(0);
    this.updateReadingStatsText();
  }

  private noteReadingActivity(): void {
    this.tickReadingStats();
    this.statsLastActivity = Date.now();
  }

  private tickReadingStats(): void {
    const now = Date.now();
    if (!this.bookState?.readingStats || !this.statsLastTick) return;
    const elapsed = Math.max(0, Math.min(30000, now - this.statsLastTick));
    this.statsLastTick = now;
    if (document.visibilityState === "hidden" || now - this.statsLastActivity > 120000) return;
    this.bookState.readingStats.totalReadingMs += elapsed;
    this.bookState.readingStats.lastReadAt = now;
    this.sessionReadingMs += elapsed;
    this.plugin.store.markChanged(250);
    this.updateReadingStatsText();
  }

  private updateReadingStatsText(): void {
    const remaining = this.bookState?.readingStats;
    const estimate = remaining && remaining.furthestFraction >= 0.02
      ? remaining.totalReadingMs / remaining.furthestFraction * (1 - remaining.furthestFraction)
      : 0;
    this.readingStatsEl?.setText(`本次 ${duration(this.sessionReadingMs)}${estimate ? ` · 剩余约 ${duration(estimate)}` : ""}`);
  }

  openReadingStats(): void {
    this.tickReadingStats();
    const stats = this.bookState?.readingStats;
    if (!stats) {
      new Notice("暂无阅读统计");
      return;
    }
    new ReadingStatsModal(this.app, stats, this.sessionReadingMs, () => {
      if (stats.completedAt) delete stats.completedAt;
      else stats.completedAt = Date.now();
      this.plugin.store.markChanged(0);
    }).open();
  }

  private renderToc(items: FoliateTocItem[]): void {
    if (!this.tocPanelEl) return;
    this.tocPanelEl.empty();
    this.tocLinks.clear();
    if (!items.length) {
      this.tocPanelEl.createDiv({ cls: "pavel-epub-empty", text: "此书没有可用目录" });
      return;
    }
    this.renderTocLevel(this.tocPanelEl, items);
  }

  private renderTocLevel(parent: HTMLElement, items: FoliateTocItem[]): void {
    const list = parent.createEl("ul", { cls: "pavel-epub-toc-list" });
    for (const item of items) {
      const row = list.createEl("li");
      const label = formatLanguageValue(item.label) || "未命名章节";
      const button = row.createEl("button", { cls: "pavel-epub-list-button", text: label, attr: { type: "button" } });
      if (item.href) {
        this.tocLinks.set(item.href, button);
        button.addEventListener("click", () => {
          void this.reader?.goTo(item.href as string);
          if (Platform.isMobile) this.setSidebarOpen(false);
        });
      } else {
        button.disabled = true;
      }
      if (item.subitems?.length) this.renderTocLevel(row, item.subitems);
    }
  }

  private updateCurrentToc(href: string | undefined): void {
    for (const button of this.tocLinks.values()) button.removeClass("is-current");
    if (href) this.tocLinks.get(href)?.addClass("is-current");
  }

  private renderBookmarks(): void {
    if (!this.bookmarkPanelEl) return;
    this.bookmarkPanelEl.empty();
    const items = this.bookState?.bookmarks ?? [];
    if (!items.length) {
      this.bookmarkPanelEl.createDiv({ cls: "pavel-epub-empty", text: "还没有书签" });
      return;
    }
    for (const bookmark of items) this.renderBookmarkItem(this.bookmarkPanelEl, bookmark);
  }

  private renderBookmarkItem(parent: HTMLElement, bookmark: Bookmark): void {
    const row = parent.createDiv({ cls: `pavel-epub-saved-item${bookmark.stale ? " is-stale" : ""}` });
    const open = row.createEl("button", { cls: "pavel-epub-saved-content", attr: { type: "button" } });
    open.createDiv({ cls: "pavel-epub-saved-title", text: bookmark.chapter });
    open.createDiv({ cls: "pavel-epub-saved-meta", text: `${percentage(bookmark.fraction)} · ${new Date(bookmark.createdAt).toLocaleDateString()}` });
    open.addEventListener("click", () => void this.navigateSavedLocation(bookmark));
    const remove = iconButton(row, "trash-2", "删除书签");
    remove.addEventListener("click", () => {
      if (!this.bookState) return;
      this.bookState.bookmarks = this.bookState.bookmarks.filter((item) => item.id !== bookmark.id);
      this.plugin.store.markChanged(0);
      this.renderBookmarks();
      this.updateBookmarkButton();
    });
  }

  private renderHighlights(): void {
    if (!this.highlightPanelEl) return;
    this.highlightPanelEl.empty();
    const items = this.bookState?.highlights ?? [];
    const documents = this.bookState?.annotationDocuments;
    if (documents) {
      const actions = this.highlightPanelEl.createDiv({ cls: "pavel-epub-document-actions" });
      const exportHighlights = actions.createEl("button", { text: "导出高亮", attr: { type: "button", "aria-label": "导出全部高亮摘抄" } });
      exportHighlights.addEventListener("click", () => void this.exportAnnotations("highlights"));
      const exportNotes = actions.createEl("button", { text: "导出笔记", attr: { type: "button", "aria-label": "导出全部高亮笔记" } });
      exportNotes.addEventListener("click", () => void this.exportAnnotations("notes"));
    }
    if (!items.length) {
      this.highlightPanelEl.createDiv({ cls: "pavel-epub-empty", text: "选中文字即可创建高亮" });
      return;
    }
    const availableTags = Array.from(new Set(items.flatMap((highlight) => highlight.tags))).sort((left, right) => left.localeCompare(right, "zh-CN"));
    const availableChapters = Array.from(new Set(items.map((highlight) => highlight.chapter))).sort((left, right) => left.localeCompare(right, "zh-CN"));
    if (this.highlightTagFilter && !availableTags.includes(this.highlightTagFilter)) this.highlightTagFilter = "";
    if (this.highlightChapterFilter && !availableChapters.includes(this.highlightChapterFilter)) this.highlightChapterFilter = "";
    const filter = this.highlightPanelEl.createDiv({ cls: "pavel-epub-highlight-filter" });
    const tagSelect = filter.createEl("select", { attr: { "aria-label": "按标签筛选标注" } });
    tagSelect.createEl("option", { text: "全部标签", value: "" });
    for (const tag of availableTags) tagSelect.createEl("option", { text: tag, value: tag });
    tagSelect.value = this.highlightTagFilter;
    tagSelect.disabled = !availableTags.length;
    tagSelect.addEventListener("change", () => {
      this.highlightTagFilter = tagSelect.value;
      this.renderHighlights();
    });
    const chapterSelect = filter.createEl("select", { attr: { "aria-label": "按章节筛选标注" } });
    chapterSelect.createEl("option", { text: "全部章节", value: "" });
    for (const chapter of availableChapters) chapterSelect.createEl("option", { text: chapter, value: chapter });
    chapterSelect.value = this.highlightChapterFilter;
    chapterSelect.addEventListener("change", () => {
      this.highlightChapterFilter = chapterSelect.value;
      this.renderHighlights();
    });
    const colorSelect = filter.createEl("select", { attr: { "aria-label": "按颜色筛选标注" } });
    colorSelect.createEl("option", { text: "全部颜色", value: "" });
    for (const [color, definition] of Object.entries(HIGHLIGHT_COLORS) as Array<[HighlightColor, typeof HIGHLIGHT_COLORS[HighlightColor]]>) {
      colorSelect.createEl("option", { text: definition.label, value: color });
    }
    colorSelect.value = this.highlightColorFilter;
    colorSelect.addEventListener("change", () => {
      this.highlightColorFilter = colorSelect.value as HighlightColor | "";
      this.renderHighlights();
    });
    const noteSelect = filter.createEl("select", { attr: { "aria-label": "按笔记状态筛选标注" } });
    for (const [value, text] of [["all", "全部笔记状态"], ["with-note", "有笔记"], ["without-note", "无笔记"]]) {
      noteSelect.createEl("option", { value, text });
    }
    noteSelect.value = this.highlightNoteFilter;
    noteSelect.addEventListener("change", () => {
      this.highlightNoteFilter = noteSelect.value as HighlightNoteFilter;
      this.renderHighlights();
    });
    const sortSelect = filter.createEl("select", { attr: { "aria-label": "标注排序" } });
    for (const [value, text] of [["newest", "最新创建"], ["oldest", "最早创建"], ["chapter", "按章节"]]) {
      sortSelect.createEl("option", { value, text });
    }
    sortSelect.value = this.highlightSort;
    sortSelect.addEventListener("change", () => {
      this.highlightSort = sortSelect.value as HighlightSort;
      this.renderHighlights();
    });
    const dateSelect = filter.createEl("select", { attr: { "aria-label": "按创建时间筛选标注" } });
    for (const [value, text] of [["all", "全部时间"], ["today", "今天"], ["7d", "最近 7 天"], ["30d", "最近 30 天"]]) {
      dateSelect.createEl("option", { value, text });
    }
    dateSelect.value = this.highlightDateFilter;
    dateSelect.addEventListener("change", () => {
      this.highlightDateFilter = dateSelect.value as HighlightDateFilter;
      this.renderHighlights();
    });
    const now = Date.now();
    const dayStart = new Date().setHours(0, 0, 0, 0);
    const minimumDate = this.highlightDateFilter === "today" ? dayStart
      : this.highlightDateFilter === "7d" ? now - 7 * 86400000
        : this.highlightDateFilter === "30d" ? now - 30 * 86400000
          : 0;
    const filteredItems = items
      .filter((highlight) => !this.highlightTagFilter || highlight.tags.includes(this.highlightTagFilter))
      .filter((highlight) => !this.highlightChapterFilter || highlight.chapter === this.highlightChapterFilter)
      .filter((highlight) => !this.highlightColorFilter || highlight.color === this.highlightColorFilter)
      .filter((highlight) => this.highlightNoteFilter === "all"
        || (this.highlightNoteFilter === "with-note" ? Boolean(highlight.note?.trim()) : !highlight.note?.trim()))
      .filter((highlight) => !minimumDate || highlight.createdAt >= minimumDate)
      .sort((left, right) => this.highlightSort === "oldest"
        ? left.createdAt - right.createdAt
        : this.highlightSort === "chapter"
          ? left.chapter.localeCompare(right.chapter, "zh-CN") || left.createdAt - right.createdAt
          : right.createdAt - left.createdAt);
    filter.createSpan({ text: `${filteredItems.length}/${items.length}` });
    if (!filteredItems.length) {
      this.highlightPanelEl.createDiv({ cls: "pavel-epub-empty", text: "没有匹配该标签的标注" });
      return;
    }
    for (const highlight of filteredItems) {
      const row = this.highlightPanelEl.createDiv({ cls: `pavel-epub-saved-item is-highlight is-style-${highlight.style}${highlight.stale ? " is-stale" : ""}` });
      row.style.setProperty("--highlight-color", HIGHLIGHT_COLORS[highlight.color].value);
      const open = row.createEl("button", { cls: "pavel-epub-saved-content", attr: { type: "button" } });
      open.createDiv({ cls: "pavel-epub-highlight-text", text: highlight.text });
      open.createDiv({ cls: "pavel-epub-saved-meta", text: `${highlight.chapter} · ${HIGHLIGHT_STYLES[highlight.style].label}` });
      if (highlight.tags.length) {
        const tags = open.createDiv({ cls: "pavel-epub-highlight-tags" });
        for (const tag of highlight.tags) tags.createSpan({ text: tag });
      }
      if (highlight.note) open.createDiv({ cls: "pavel-epub-note-preview", text: highlight.note });
      open.addEventListener("click", () => void this.navigateSavedLocation(highlight));
      const note = iconButton(row, "notebook-pen", highlight.note ? "编辑标注与笔记" : "编辑标注并添加笔记");
      note.toggleClass("is-active", Boolean(highlight.note));
      note.addEventListener("click", () => this.openHighlightActions(highlight));
      const remove = iconButton(row, "trash-2", "删除高亮");
      remove.addEventListener("click", () => void this.deleteHighlight(highlight));
    }
  }

  private openAnnotationDocument(path: string): void {
    void this.app.workspace.openLinkText(path, this.file?.path ?? "", false);
  }

  private async navigateSavedLocation(item: Bookmark | ReaderHighlight): Promise<void> {
    if (!this.reader) return;
    const result = await this.reader.goTo(item.cfi);
    if (!result) {
      item.stale = true;
      this.plugin.store.markChanged(0);
      this.renderBookmarks();
      this.renderHighlights();
      new Notice("该定位已失效，数据已保留供你删除或检查");
      return;
    }
    item.stale = false;
    if (Platform.isMobile) this.setSidebarOpen(false);
  }

  private updateBookmarkButton(): void {
    const active = Boolean(this.currentLocation.cfi && this.bookState?.bookmarks.some((item) => item.cfi === this.currentLocation.cfi));
    this.bookmarkButton?.toggleClass("is-active", active);
    this.bookmarkButton?.setAttribute("aria-label", active ? "移除当前位置书签" : "添加当前位置书签");
  }

  private scheduleSearch(): void {
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    this.searchSession.cancel();
    this.searchTimer = window.setTimeout(() => {
      this.searchTimer = null;
      void this.performSearch(this.searchInputEl?.value.trim() ?? "");
    }, 250);
  }

  private async performSearch(query: string): Promise<void> {
    if (!this.reader || !this.searchResultsEl || !this.searchStatusEl) return;
    const token = this.searchSession.begin();
    this.searchResultsEl.empty();
    this.reader.clearSearch();
    if (!query) {
      this.searchStatusEl.setText("输入关键词开始搜索");
      return;
    }
    this.searchStatusEl.setText("正在搜索 0%…");
    let count = 0;
    let truncated = false;
    try {
      for await (const result of this.reader.search({
        query,
        matchCase: false,
        matchDiacritics: false,
        matchWholeWords: false,
      })) {
        if (!this.searchSession.isActive(token)) break;
        if (result === "done") break;
        if ("progress" in result) {
          this.searchStatusEl.setText(`正在搜索 ${percentage(result.progress)}…已找到 ${count} 条`);
          continue;
        }
        const group = result as Extract<FoliateSearchResult, { subitems: FoliateSearchItem[] }>;
        for (const item of group.subitems) {
          if (count >= 500) {
            truncated = true;
            break;
          }
          this.renderSearchResult(group.label || "未命名章节", item);
          count += 1;
        }
        if (truncated) break;
      }
      if (this.searchSession.isActive(token)) {
        this.searchStatusEl.setText(truncated ? `已显示前 500 条结果，请缩小关键词范围` : `找到 ${count} 条结果`);
      }
    } catch (error) {
      if (this.searchSession.isActive(token)) {
        console.error("[OmniReader] Search failed", error);
        this.searchStatusEl.setText("搜索失败，请重试");
      }
    }
  }

  private renderSearchResult(label: string, item: FoliateSearchItem): void {
    if (!this.searchResultsEl) return;
    const button = this.searchResultsEl.createEl("button", { cls: "pavel-epub-search-result", attr: { type: "button" } });
    button.createDiv({ cls: "pavel-epub-search-result-title", text: label });
    button.createDiv({ cls: "pavel-epub-search-result-excerpt", text: excerptToText(item.excerpt) || "匹配内容" });
    button.addEventListener("click", () => {
      void this.reader?.select(item.cfi);
      if (Platform.isMobile) this.setSidebarOpen(false);
    });
  }

  private activateTab(tab: SidebarTab): void {
    this.activeTab = tab;
    for (const [key, button] of this.tabButtons) {
      const active = key === tab;
      button.toggleClass("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
    for (const [key, panel] of this.tabPanels) panel.toggleClass("is-active", key === tab);
  }

  private setSidebarOpen(open: boolean): void {
    this.sidebarOpen = open;
    this.rootEl?.toggleClass("is-sidebar-open", open);
    this.sidebarEl?.setAttribute("aria-hidden", String(!open));
    this.sidebarBackdropEl?.toggleClass("is-visible", open);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return;
    if (event.key === "Escape") {
      if (this.pendingSelection) this.clearPendingSelection();
      else if (this.focusMode) this.toggleFocusMode(false);
      else if (Platform.isMobile && this.sidebarOpen) this.setSidebarOpen(false);
      return;
    }
    if (!this.reader || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      void this.reader.goLeft();
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      void this.reader.goRight();
    } else if (event.key === "PageUp" || event.key === "Home") {
      event.preventDefault();
      if (event.key === "Home") void this.reader.goToFraction(0);
      else void this.reader.prev();
    } else if (event.key === "PageDown" || event.key === " " || event.key === "End") {
      event.preventDefault();
      if (event.key === "End") void this.reader.goToFraction(1);
      else void this.reader.next();
    }
  }

  private handleWheel(event: WheelEvent): void {
    if (!this.reader || this.plugin.getReaderSettings().layout !== "paginated") return;
    if (event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!delta) return;
    event.preventDefault();
    this.noteReadingActivity();
    const normalized = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? delta * 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? delta * 100
        : delta;
    this.wheelDelta += normalized;
    if (Math.abs(this.wheelDelta) < 70) return;
    const now = Date.now();
    if (now - this.lastWheelTurnAt < 260) return;
    const forward = this.wheelDelta > 0;
    this.wheelDelta = 0;
    this.lastWheelTurnAt = now;
    void (forward ? this.reader.goRight() : this.reader.goLeft());
  }

  private handleMobileHardwareKey(event: KeyboardEvent): void {
    if (!Platform.isMobile || !this.reader || event.repeat || isEditableTarget(event.target)) return;
    if (this.app.workspace.getActiveViewOfType(PavelEpubReaderView) !== this) return;
    const previous = event.key === "AudioVolumeUp" || event.key === "VolumeUp" || event.code === "AudioVolumeUp";
    const next = event.key === "AudioVolumeDown" || event.key === "VolumeDown" || event.code === "AudioVolumeDown";
    if (!previous && !next) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    this.noteReadingActivity();
    void (next ? this.reader.goRight() : this.reader.goLeft());
  }

  private showLoading(message: string): void {
    if (!this.viewerEl) return;
    this.viewerEl.empty();
    this.loadingEl = this.viewerEl.createDiv({ cls: "pavel-epub-loading", text: message });
  }

  private hideLoading(): void {
    this.loadingEl?.remove();
    this.loadingEl = null;
  }

  private showLoadError(file: TFile, error: unknown): void {
    if (!this.viewerEl) return;
    this.viewerEl.empty();
    const panel = this.viewerEl.createDiv({ cls: "pavel-epub-error" });
    panel.createEl("h3", { text: "无法打开这本 EPUB" });
    panel.createEl("p", { text: error instanceof Error ? error.message : "文件可能已损坏或格式不受支持。" });
    const retry = panel.createEl("button", { cls: "mod-cta", text: "重试" });
    retry.addEventListener("click", () => void this.loadBook(file));
  }

  private async cleanupReader(invalidateLoad = true): Promise<void> {
    if (invalidateLoad) this.loadGeneration += 1;
    this.saveCurrentPosition();
    this.tickReadingStats();
    if (this.statsTimer !== null) window.clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.statsLastTick = 0;
    this.statsLastActivity = 0;
    this.searchSession.cancel();
    if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
    if (this.progressTimer !== null) window.clearTimeout(this.progressTimer);
    this.searchTimer = null;
    this.progressTimer = null;
    this.clearPendingSelection(false);
    this.toggleFocusMode(false);
    for (const cleanup of this.cleanupCallbacks.splice(0)) {
      try { cleanup(); } catch { /* Ignore cleanup races. */ }
    }
    const reader = this.reader;
    this.reader = null;
    if (reader) {
      try { reader.clearSearch(); } catch { /* Reader may not have opened fully. */ }
      try { reader.close(); } catch { /* Reader may not have opened fully. */ }
      try { reader.book?.sections?.forEach((section) => section.unload?.()); } catch { /* Best effort. */ }
      try { reader.book?.destroy?.(); } catch { /* Best effort. */ }
      reader.remove();
    }
    this.bookState = null;
    this.currentLocation = {};
    this.highlightTagFilter = "";
    this.highlightChapterFilter = "";
    this.highlightColorFilter = "";
    this.highlightNoteFilter = "all";
    this.highlightDateFilter = "all";
    this.highlightSort = "newest";
    this.fixedLayout = false;
    this.bookAuthor = "";
    this.loadedFileKey = "";
  }
}
