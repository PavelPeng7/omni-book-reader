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
import { annotationValueAtPoint } from "./annotation-hit-test";
import { exportChapterMarkdown } from "./chapter-export";
import { readEpubBinaryCandidates } from "./epub-binary";
import { installBlobUrlRegistry } from "./blob-url-registry";
import { extractEpubCover } from "./epub-cover";
import { connectAdjacentHighlightRanges } from "./highlight-range-connection";
import {
  bookLoadTimeout,
  createEpubBook,
  isReadableEpubArchive,
  withLoadTimeout,
} from "./epub-loader";
import {
  installDesktopFoliateIframeSandboxPatch,
  installFoliateBlobIframePatch,
} from "./foliate-runtime-patches";
import { installFoliateCustomElementGuard } from "./foliate-custom-element-guard";
import { uiLocale, uiText } from "./i18n";
import { extensionForBlob, safeFileName, saveBlobToVault, sourceToBlob } from "./media-utils";
import { applyReflowableLayout, resolveViewportWidth } from "./reader-layout";
import {
  isPageTurnTap,
  isTextSelectionGesture,
  mobilePageTurnDirection,
  shouldIsolatePaginatorPointer,
  shouldSuppressTouchPageTurn,
  swipePageTurnDirection,
  tapPageTurnDirection,
} from "./mobile-input";
import { installPublicationSanitizer } from "./sanitizer";
import { SearchSession } from "./search-session";
import { ReaderSettingsModal, type SettingsHost } from "./settings-ui";
import type { ReaderDataStore } from "./store";
import type {
  BookState,
  Bookmark,
  FoliateBook,
  FoliateLocation,
  FoliateSearchItem,
  FoliateTocItem,
  FoliateViewElement,
  HighlightColor,
  HighlightStyle,
  InterfaceLanguage,
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

export const OMNI_BOOK_READER_VIEW_TYPE = "omni-book-reader-view";

let foliateViewModulePromise: Promise<unknown> | null = null;

async function ensureFoliateViewModule(): Promise<void> {
  installFoliateCustomElementGuard();
  foliateViewModulePromise ??= import("foliate-js/view.js");
  await foliateViewModulePromise;
}

const HIGHLIGHT_COLORS: Record<HighlightColor, { zh: string; en: string; value: string }> = {
  yellow: { zh: "黄色高亮", en: "Yellow highlight", value: "#ffd54f" },
  green: { zh: "绿色高亮", en: "Green highlight", value: "#81c784" },
  blue: { zh: "蓝色高亮", en: "Blue highlight", value: "#64b5f6" },
  pink: { zh: "粉色高亮", en: "Pink highlight", value: "#f48fb1" },
};

const HIGHLIGHT_STYLES: Record<HighlightStyle, { zh: string; en: string; icon: string }> = {
  highlight: { zh: "高亮", en: "Highlight", icon: "highlighter" },
  underline: { zh: "下划线", en: "Underline", icon: "underline" },
  strikethrough: { zh: "删除线", en: "Strikethrough", icon: "strikethrough" },
  squiggly: { zh: "波浪线", en: "Squiggly underline", icon: "waves" },
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

function isDomRange(value: unknown): value is Range {
  if (!value || typeof value !== "object") return false;
  const range = value as Partial<Range>;
  return Boolean(
    range.startContainer
    && range.endContainer
    && typeof range.comparePoint === "function"
    && typeof range.cloneRange === "function",
  );
}

export interface ReaderPluginHost extends SettingsHost {
  store: ReaderDataStore;
  updateReaderSettings(patch: Partial<ReaderSettings>): void;
  syncAnnotationDocuments(input: AnnotationDocumentInput): Promise<void>;
}

function iconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "omni-book-reader-icon-button clickable-icon",
    attr: { type: "button", "aria-label": label, title: label },
  });
  setIcon(button, icon);
  return button;
}

function percentage(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function duration(value: number, language: InterfaceLanguage): string {
  const minutes = Math.max(0, Math.round(value / 60000));
  if (minutes < 60) return uiText(language, `${minutes} 分钟`, `${minutes} min`);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder
    ? uiText(language, `${hours} 小时 ${remainder} 分钟`, `${hours} hr ${remainder} min`)
    : uiText(language, `${hours} 小时`, `${hours} hr`);
}

class ReadingStatsModal extends Modal {
  constructor(
    app: ReaderPluginHost["app"],
    private readonly stats: ReadingStats,
    private readonly sessionMs: number,
    private readonly language: InterfaceLanguage,
    private readonly onToggleComplete: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const t = (zh: string, en: string): string => uiText(this.language, zh, en);
    this.titleEl.setText(t("阅读统计", "Reading statistics"));
    const grid = this.contentEl.createDiv({ cls: "omni-book-reader-stats-grid" });
    const fraction = this.stats.furthestFraction;
    const estimated = fraction >= 0.02
      ? this.stats.totalReadingMs / fraction * (1 - fraction)
      : 0;
    for (const [label, value] of [
      [t("本次阅读", "This session"), duration(this.sessionMs, this.language)],
      [t("累计阅读", "Total reading"), duration(this.stats.totalReadingMs, this.language)],
      [t("阅读进度", "Reading progress"), percentage(fraction)],
      [t("预计剩余", "Estimated remaining"), estimated ? duration(estimated, this.language) : t("数据不足", "Not enough data")],
      [t("完成状态", "Completion status"), this.stats.completedAt
        ? t(`已完成 · ${new Date(this.stats.completedAt).toLocaleDateString(uiLocale(this.language))}`, `Finished · ${new Date(this.stats.completedAt).toLocaleDateString(uiLocale(this.language))}`)
        : t("阅读中", "Reading")],
    ]) {
      const item = grid.createDiv({ cls: "omni-book-reader-stat-item" });
      item.createDiv({ cls: "omni-book-reader-stat-label", text: label });
      item.createDiv({ cls: "omni-book-reader-stat-value", text: value });
    }
    const actions = this.contentEl.createDiv({ cls: "omni-book-reader-modal-actions" });
    const close = actions.createEl("button", { text: t("关闭", "Close") });
    const complete = actions.createEl("button", { cls: "mod-cta", text: this.stats.completedAt ? t("标记为未完成", "Mark as unfinished") : t("标记为已完成", "Mark as finished") });
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
    private readonly language: InterfaceLanguage,
    private readonly onSave: (edit: HighlightEdit) => Promise<void>,
    private readonly onDelete: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const t = (zh: string, en: string): string => uiText(this.language, zh, en);
    this.titleEl.setText(t("编辑标注", "Edit annotation"));
    this.contentEl.createDiv({ cls: "omni-book-reader-highlight-quote", text: this.highlight.text });
    this.contentEl.createDiv({ cls: "omni-book-reader-highlight-chapter", text: this.highlight.chapter });
    const label = this.contentEl.createEl("label", { cls: "omni-book-reader-note-label", text: t("笔记", "Note") });
    const textarea = label.createEl("textarea", {
      cls: "omni-book-reader-note-input",
      attr: {
        placeholder: t("写下对这段高亮的想法…", "Write your thoughts about this highlight…"),
        maxlength: "20000",
        rows: "7",
        "aria-label": t("高亮笔记", "Highlight note"),
      },
    });
    textarea.value = this.highlight.note ?? "";
    const options = this.contentEl.createDiv({ cls: "omni-book-reader-annotation-options" });
    const colorLabel = options.createEl("label", { text: t("颜色", "Color") });
    const colorSelect = colorLabel.createEl("select", { attr: { "aria-label": t("标注颜色", "Annotation color") } });
    for (const [color, definition] of Object.entries(HIGHLIGHT_COLORS) as Array<[HighlightColor, typeof HIGHLIGHT_COLORS[HighlightColor]]>) {
      colorSelect.createEl("option", { text: uiText(this.language, definition.zh, definition.en), value: color });
    }
    colorSelect.value = this.highlight.color;
    const styleLabel = options.createEl("label", { text: t("样式", "Style") });
    const styleSelect = styleLabel.createEl("select", { attr: { "aria-label": t("标注样式", "Annotation style") } });
    for (const [style, definition] of Object.entries(HIGHLIGHT_STYLES) as Array<[HighlightStyle, typeof HIGHLIGHT_STYLES[HighlightStyle]]>) {
      styleSelect.createEl("option", { text: uiText(this.language, definition.zh, definition.en), value: style });
    }
    styleSelect.value = this.highlight.style;
    const tagsLabel = this.contentEl.createEl("label", { cls: "omni-book-reader-note-label", text: t("标签", "Tags") });
    const tagsInput = tagsLabel.createEl("input", {
      cls: "omni-book-reader-tags-input",
      type: "text",
      attr: { placeholder: t("心理学, 原型, 待读", "psychology, archetype, read later"), "aria-label": t("标注标签", "Annotation tags") },
    });
    tagsInput.value = this.highlight.tags.join(", ");
    this.contentEl.createDiv({ cls: "omni-book-reader-note-hint", text: t("清空并保存可移除笔记；高亮原文仍会保留。", "Clear and save to remove the note; the highlight remains.") });
    const actions = this.contentEl.createDiv({ cls: "omni-book-reader-modal-actions" });
    const cancel = actions.createEl("button", { text: t("关闭", "Close") });
    const remove = actions.createEl("button", { cls: "mod-warning", text: t("删除高亮", "Delete highlight") });
    const save = actions.createEl("button", { cls: "mod-cta", text: t("保存笔记", "Save note") });
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
      console.error("[Omni Book Reader] Highlight action failed", error);
      new Notice(error instanceof Error ? error.message : uiText(this.language, "保存高亮笔记失败", "Could not save the highlight note"));
      for (const button of buttons) button.disabled = false;
    }
  }
}

class FootnotePreviewModal extends Modal {
  constructor(
    app: ReaderPluginHost["app"],
    private readonly preview: FoliateViewElement,
    private readonly href: string,
    private readonly language: InterfaceLanguage,
    private readonly onNavigate: (href: string) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const t = (zh: string, en: string): string => uiText(this.language, zh, en);
    this.titleEl.setText(t("脚注预览", "Footnote preview"));
    const host = this.contentEl.createDiv({ cls: "omni-book-reader-footnote-preview" });
    host.appendChild(this.preview);
    const actions = this.contentEl.createDiv({ cls: "omni-book-reader-modal-actions" });
    const close = actions.createEl("button", { text: t("关闭", "Close") });
    const navigate = actions.createEl("button", { cls: "mod-cta", text: t("跳转到正文位置", "Go to text") });
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
    private readonly language: InterfaceLanguage,
    private readonly onSave: (blob: Blob) => Promise<string>,
  ) {
    super(app);
  }

  onOpen(): void {
    const t = (zh: string, en: string): string => uiText(this.language, zh, en);
    this.titleEl.setText(this.alt || t("书内图片", "Book image"));
    const viewport = this.contentEl.createDiv({ cls: "omni-book-reader-image-preview" });
    const image = viewport.createEl("img", { attr: { src: this.source, alt: this.alt || t("书内图片", "Book image") } });
    const controls = this.contentEl.createDiv({ cls: "omni-book-reader-image-controls" });
    controls.createSpan({ text: t("缩放", "Zoom") });
    const zoom = controls.createEl("input", { type: "range", attr: { min: "50", max: "400", value: "100", step: "10", "aria-label": t("图片缩放", "Image zoom") } });
    const zoomText = controls.createSpan({ text: "100%" });
    zoom.addEventListener("input", () => {
      const value = Number(zoom.value);
      image.setCssStyles({ width: `${value}%` });
      zoomText.setText(`${value}%`);
    });
    const actions = this.contentEl.createDiv({ cls: "omni-book-reader-modal-actions" });
    const close = actions.createEl("button", { text: t("关闭", "Close") });
    const save = actions.createEl("button", { cls: "mod-cta", text: t("保存到 Vault", "Save to Vault") });
    close.addEventListener("click", () => this.close());
    save.addEventListener("click", () => void this.run(save, async () => {
      const path = await this.onSave(await this.getBlob());
      new Notice(t(`图片已保存：${path}`, `Image saved: ${path}`));
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
    catch (error) { new Notice(error instanceof Error ? error.message : uiText(this.language, "图片操作失败", "Image operation failed")); }
    finally { button.disabled = false; }
  }
}

export class OmniBookReaderView extends FileView {
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
  private quickSettingsButton: HTMLButtonElement | null = null;
  private quickSettingsEl: HTMLElement | null = null;
  private selectionToolbarEl: HTMLElement | null = null;
  private searchInputEl: HTMLInputElement | null = null;
  private searchStatusEl: HTMLElement | null = null;
  private searchResultsEl: HTMLElement | null = null;
  private tocPanelEl: HTMLElement | null = null;
  private bookmarkPanelEl: HTMLElement | null = null;
  private highlightPanelEl: HTMLElement | null = null;
  private sidebarBookTitleEl: HTMLElement | null = null;
  private sidebarBookAuthorEl: HTMLElement | null = null;
  private sidebarCoverMarkEl: HTMLElement | null = null;
  private sidebarCoverEl: HTMLElement | null = null;
  private sidebarCoverUrl: string | null = null;
  private sidebarProgressEl: HTMLInputElement | null = null;
  private sidebarProgressTextEl: HTMLElement | null = null;
  private tabButtons = new Map<SidebarTab, HTMLButtonElement>();
  private tabCountEls = new Map<SidebarTab, HTMLElement>();
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
  private selectionClearTimer: number | null = null;
  private progressTimer: number | null = null;
  private statsTimer: number | null = null;
  private statsLastTick = 0;
  private statsLastActivity = 0;
  private sessionReadingMs = 0;
  private focusMode = false;
  private quickSettingsOpen = false;
  private ownsFullscreen = false;
  private sidebarOpenBeforeFocus = false;
  private loadGeneration = 0;
  private cleanupCallbacks: Array<() => void> = [];
  private attachedDocuments = new WeakSet<Document>();
  private pageTurnRunning = false;
  private pendingPageTurn: "previous" | "next" | null = null;
  private pageTurnRunId = 0;
  private searchSession = new SearchSession();
  private themeObserver: MutationObserver | null = null;
  private layoutObserver: ResizeObserver | null = null;
  private layoutFrame: number | null = null;
  private wheelDelta = 0;
  private lastWheelTurnAt = 0;
  private bookTitle = "Omni Book Reader";
  private bookAuthor = "";
  private fixedLayout = false;
  private loadedFileKey = "";

  constructor(leaf: WorkspaceLeaf, private readonly plugin: ReaderPluginHost) {
    super(leaf);
    this.navigation = true;
  }

  getViewType(): string {
    return OMNI_BOOK_READER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.bookTitle || this.file?.basename || "Omni Book Reader";
  }

  getIcon(): string {
    return "book-open";
  }

  canAcceptExtension(extension: string): boolean {
    return extension.toLowerCase() === "epub";
  }

  async onOpen(): Promise<void> {
    await this.ensureFoliateRuntimeCompatibility();
    this.buildShell();
    this.registerDomEvent(document, "keydown", (event: KeyboardEvent) => this.handleMobileHardwareKey(event), true);
    this.registerDomEvent(document, "fullscreenchange", () => this.handleFullscreenChange());
    this.themeObserver = new MutationObserver(() => this.applySettings());
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (this.file) void this.loadBook(this.file);
  }

  async onLoadFile(file: TFile): Promise<void> {
    if (!this.rootEl) this.buildShell();
    // FileView waits for this hook before revealing the leaf. Run the archive
    // work in the background so the loading state is visible immediately.
    void this.loadBook(file);
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
    this.rootEl?.setAttribute("data-width-mode", settings.widthMode);
    if (!this.reader) return;
    const renderer = this.reader.renderer;
    if (!renderer) return;
    const viewportWidth = resolveViewportWidth(
      this.readingAreaEl?.getBoundingClientRect().width ?? 0,
      this.viewerEl?.getBoundingClientRect().width ?? 0,
      Boolean(this.rootEl?.hasClass("is-compact-reading-area")),
    );
    if (viewportWidth) {
      this.reader.setCssStyles({ width: `${viewportWidth}px`, maxWidth: "100%", minWidth: "0" });
      renderer.setCssStyles({ width: "100%", maxWidth: "100%", minWidth: "0" });
    }
    if (!this.fixedLayout) {
      applyReflowableLayout(renderer, settings, viewportWidth);
    }
  }

  refreshLanguage(): void {
    const file = this.file;
    void this.cleanupReader().then(async () => {
      this.buildShell();
      if (file) await this.loadBook(file);
    });
  }

  toggleSidebar(): void {
    this.setSidebarOpen(!this.sidebarOpen);
  }

  toggleBookmark(): void {
    if (!this.bookState || !this.currentLocation.cfi) {
      new Notice(this.text("当前还没有可保存的阅读位置", "There is no reading position to bookmark yet"));
      return;
    }
    const index = this.bookState.bookmarks.findIndex((item) => item.cfi === this.currentLocation.cfi);
    if (index >= 0) {
      this.bookState.bookmarks.splice(index, 1);
      new Notice(this.text("已移除当前位置书签", "Bookmark removed"));
    } else {
      this.bookState.bookmarks.unshift({
        id: createId("bookmark"),
        cfi: this.currentLocation.cfi,
        fraction: this.currentLocation.fraction ?? 0,
        chapter: this.currentChapter(),
        createdAt: Date.now(),
      });
      new Notice(this.text("已添加书签", "Bookmark added"));
    }
    this.plugin.store.markChanged(0);
    this.renderBookmarks();
    this.updateBookmarkButton();
  }

  async exportAnnotations(kind: AnnotationExportKind): Promise<void> {
    if (!this.bookState || !this.file) {
      new Notice(this.text("请先打开一本 EPUB", "Open an EPUB first"));
      return;
    }
    const highlights = this.bookState.highlights;
    if (kind === "highlights" && !highlights.length) {
      new Notice(this.text("当前书籍还没有可导出的高亮摘抄", "This book has no highlights to export"));
      return;
    }
    if (kind === "notes" && !highlights.some((highlight) => Boolean(highlight.note?.trim()))) {
      new Notice(this.text("当前书籍还没有可导出的笔记", "This book has no notes to export"));
      return;
    }
    if (!await this.syncAnnotationDocuments()) return;
    const documents = this.bookState.annotationDocuments;
    const path = kind === "highlights" ? documents?.highlightPath : documents?.notePath;
    if (!path) {
      new Notice(this.text("没有找到导出文档路径", "Could not find the export document path"));
      return;
    }
    this.openAnnotationDocument(path);
    new Notice(kind === "highlights" ? this.text("高亮摘抄已导出", "Highlights exported") : this.text("笔记已导出", "Notes exported"));
  }

  async navigateToCfi(cfi: string): Promise<void> {
    if (!this.reader || !isValidCfi(cfi)) {
      new Notice(this.text("无法打开该 EPUB 标注位置", "Could not open this EPUB annotation location"));
      return;
    }
    if (!this.reader.resolveNavigation(cfi)) {
      new Notice(this.text("该 CFI 位置已经失效", "This CFI location is no longer valid"));
      return;
    }
    await this.reader.select(cfi);
  }

  private buildShell(): void {
    const t = (zh: string, en: string): string => this.text(zh, en);
    this.contentEl.empty();
    this.contentEl.addClass("omni-book-reader-view-content");
    const root = this.contentEl.createDiv({ cls: "omni-book-reader", attr: { tabindex: "-1" } });
    this.rootEl = root;

    const header = root.createDiv({ cls: "omni-book-reader-header" });
    const sidebarToggle = iconButton(header, "panel-left", t("切换阅读侧栏", "Toggle reader sidebar"));
    sidebarToggle.addEventListener("click", () => this.toggleSidebar());
    const headings = header.createDiv({ cls: "omni-book-reader-headings" });
    this.titleEl = headings.createDiv({ cls: "omni-book-reader-title", text: "Omni Book Reader" });
    this.chapterEl = headings.createDiv({ cls: "omni-book-reader-chapter", text: t("准备打开书籍", "Preparing book") });
    const headerActions = header.createDiv({ cls: "omni-book-reader-header-actions" });
    const search = iconButton(headerActions, "search", t("搜索当前书籍", "Search this book"));
    search.addEventListener("click", () => {
      this.setSidebarOpen(true);
      window.setTimeout(() => this.searchInputEl?.focus(), 0);
    });
    this.bookmarkButton = iconButton(headerActions, "bookmark", t("添加或移除当前位置书签", "Add or remove bookmark here"));
    this.bookmarkButton.addEventListener("click", () => this.toggleBookmark());
    const exportChapter = iconButton(headerActions, "file-down", t("导出当前章节 Markdown", "Export current chapter as Markdown"));
    exportChapter.addEventListener("click", () => void this.exportCurrentChapter());
    const stats = iconButton(headerActions, "chart-no-axes-column-increasing", t("阅读统计", "Reading statistics"));
    stats.addEventListener("click", () => this.openReadingStats());
    this.focusButton = iconButton(headerActions, "maximize", t("沉浸式阅读", "Immersive reading"));
    this.focusButton.addEventListener("click", () => void this.toggleFocusMode());
    this.quickSettingsButton = iconButton(root, "sliders-horizontal", t("阅读排版", "Reading appearance"));
    this.quickSettingsButton.addClass("omni-book-reader-quick-settings-toggle");
    this.quickSettingsButton.setAttribute("aria-expanded", "false");
    this.quickSettingsButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleQuickSettings();
    });
    this.quickSettingsEl = this.buildQuickSettings(root);

    const body = root.createDiv({ cls: "omni-book-reader-body" });
    this.sidebarEl = this.buildSidebar(body);
    this.sidebarBackdropEl = body.createDiv({ cls: "omni-book-reader-sidebar-backdrop" });
    this.sidebarBackdropEl.addEventListener("click", () => this.setSidebarOpen(false));

    const readingArea = body.createDiv({ cls: "omni-book-reader-reading-area" });
    this.readingAreaEl = readingArea;
    const previous = iconButton(readingArea, "chevron-left", t("上一页", "Previous page"));
    previous.addClass("omni-book-reader-page-button", "is-previous");
    previous.addEventListener("click", () => this.queuePageTurn("previous"));
    this.viewerEl = readingArea.createDiv({ cls: "omni-book-reader-viewer" });
    this.showLoading(t("正在准备书籍…", "Preparing book…"), 0.04);
    const next = iconButton(readingArea, "chevron-right", t("下一页", "Next page"));
    next.addClass("omni-book-reader-page-button", "is-next");
    next.addEventListener("click", () => this.queuePageTurn("next"));

    const immersiveExit = readingArea.createEl("button", {
      cls: "omni-book-reader-immersive-exit",
      attr: { type: "button", "aria-label": t("退出沉浸式阅读", "Exit immersive reading"), title: t("退出沉浸式阅读", "Exit immersive reading") },
    });
    setIcon(immersiveExit, "arrow-left");
    immersiveExit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.toggleFocusMode(false);
    });
    const immersiveFooter = readingArea.createDiv({ cls: "omni-book-reader-immersive-footer", attr: { "aria-label": t("当前阅读位置", "Current reading position") } });
    this.immersiveLocationEl = immersiveFooter.createSpan({ text: t("正在定位", "Locating") });

    const footer = root.createDiv({ cls: "omni-book-reader-footer" });
    this.progressTextEl = footer.createSpan({ cls: "omni-book-reader-progress-text", text: "0%" });
    this.progressEl = footer.createEl("input", {
      cls: "omni-book-reader-progress",
      type: "range",
      attr: { min: "0", max: "1", step: "0.001", value: "0", "aria-label": t("阅读进度", "Reading progress") },
    });
    this.progressEl.addEventListener("input", () => {
      if (this.progressEl && this.progressTextEl) this.progressTextEl.setText(percentage(Number(this.progressEl.value)));
    });
    this.progressEl.addEventListener("change", () => {
      const value = Number(this.progressEl?.value ?? 0);
      void this.reader?.goToFraction(value);
    });
    this.locationTextEl = footer.createSpan({ cls: "omni-book-reader-location", text: t("尚未定位", "Not located") });
    this.readingStatsEl = footer.createSpan({ cls: "omni-book-reader-reading-stats", text: t("本次 0 分钟", "This session 0 min") });

    this.selectionToolbarEl = root.createDiv({ cls: "omni-book-reader-selection-toolbar" });
    this.selectionToolbarEl.setAttribute("role", "toolbar");
    this.selectionToolbarEl.setAttribute("aria-label", t("标注样式和颜色", "Annotation style and color"));
    const styleButtons = new Map<HighlightStyle, HTMLButtonElement>();
    for (const [style, definition] of Object.entries(HIGHLIGHT_STYLES) as Array<[HighlightStyle, typeof HIGHLIGHT_STYLES[HighlightStyle]]>) {
      const button = iconButton(this.selectionToolbarEl, definition.icon, this.definitionLabel(definition));
      button.addClass("omni-book-reader-style-button");
      button.toggleClass("is-active", style === this.selectedHighlightStyle);
      button.addEventListener("click", () => {
        this.selectedHighlightStyle = style;
        for (const [key, candidate] of styleButtons) candidate.toggleClass("is-active", key === style);
      });
      styleButtons.set(style, button);
    }
    this.selectionToolbarEl.createDiv({ cls: "omni-book-reader-toolbar-divider" });
    for (const [color, definition] of Object.entries(HIGHLIGHT_COLORS) as Array<[HighlightColor, typeof HIGHLIGHT_COLORS[HighlightColor]]>) {
      const button = this.selectionToolbarEl.createEl("button", {
        cls: `omni-book-reader-color-button is-${color}`,
        attr: { type: "button", "aria-label": this.definitionLabel(definition), title: this.definitionLabel(definition) },
      });
      button.addEventListener("click", () => void this.commitHighlight(color, this.selectedHighlightStyle));
    }
    const cancelSelection = iconButton(this.selectionToolbarEl, "x", t("取消高亮", "Cancel highlight"));
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

  private buildQuickSettings(parent: HTMLElement): HTMLElement {
    const t = (zh: string, en: string): string => this.text(zh, en);
    const panel = parent.createDiv({ cls: "omni-book-reader-quick-settings", attr: { "aria-label": t("阅读排版", "Reading appearance"), role: "dialog" } });
    const header = panel.createDiv({ cls: "omni-book-reader-quick-settings-header" });
    header.createDiv({ cls: "omni-book-reader-quick-settings-title", text: t("阅读排版", "Reading appearance") });
    const close = iconButton(header, "x", t("关闭阅读排版", "Close reading appearance"));
    close.addEventListener("click", () => this.toggleQuickSettings(false));

    const addRange = (
      label: string,
      min: number,
      max: number,
      step: number,
      read: () => number,
      format: (value: number) => string,
      update: (value: number) => void,
    ): void => {
      const row = panel.createDiv({ cls: "omni-book-reader-quick-range" });
      const heading = row.createDiv({ cls: "omni-book-reader-quick-range-heading" });
      heading.createSpan({ text: label });
      const valueEl = heading.createSpan({ cls: "omni-book-reader-quick-value", text: format(read()) });
      const input = row.createEl("input", {
        type: "range",
        attr: { min: String(min), max: String(max), step: String(step), value: String(read()), "aria-label": label },
      });
      input.disabled = this.fixedLayout;
      input.addEventListener("input", () => {
        const value = Number(input.value);
        valueEl.setText(format(value));
        update(value);
      });
    };
    const get = (): ReaderSettings => this.plugin.getReaderSettings();
    addRange(t("字号", "Font size"), 80, 180, 5, () => get().fontSizePercent, (value) => `${value}%`, (fontSizePercent) => this.plugin.updateReaderSettings({ fontSizePercent }));
    addRange(t("行高", "Line height"), 1.2, 2.2, 0.05, () => get().lineHeight, (value) => value.toFixed(2), (lineHeight) => this.plugin.updateReaderSettings({ lineHeight }));
    addRange(t("字距", "Letter spacing"), -0.02, 0.12, 0.01, () => get().letterSpacing, (value) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`, (letterSpacing) => this.plugin.updateReaderSettings({ letterSpacing }));
    addRange(t("段落间距", "Paragraph spacing"), 0, 1.2, 0.05, () => get().paragraphSpacing, (value) => value.toFixed(2), (paragraphSpacing) => this.plugin.updateReaderSettings({ paragraphSpacing }));
    addRange(t("页边距", "Page margin"), 0, 80, 4, () => get().pageMargin, (value) => String(value), (pageMargin) => this.plugin.updateReaderSettings({ pageMargin }));
    const layout = panel.createDiv({ cls: "omni-book-reader-quick-segments", attr: { role: "group", "aria-label": t("阅读布局", "Reading layout") } });
    layout.createSpan({ text: t("布局", "Layout") });
    for (const [value, label] of [["paginated", t("翻页", "Pages")], ["scrolled", t("滚动", "Scroll")]] as const) {
      const button = layout.createEl("button", { text: label, attr: { type: "button" } });
      button.toggleClass("is-active", get().layout === value);
      button.disabled = this.fixedLayout;
      button.addEventListener("click", () => {
        this.plugin.updateReaderSettings({ layout: value });
        for (const candidate of Array.from(layout.querySelectorAll("button"))) candidate.toggleClass("is-active", candidate === button);
      });
    }

    const width = panel.createDiv({ cls: "omni-book-reader-quick-segments is-width-mode", attr: { role: "group", "aria-label": t("页面宽度", "Page width") } });
    width.createSpan({ text: t("页面宽度", "Page width") });
    for (const [value, label] of [["standard", t("标准", "Standard")], ["wide", t("宽版", "Wide")], ["full", t("全宽", "Full")], ["edge", t("贴边", "Edge")]] as const) {
      const button = width.createEl("button", { text: label, attr: { type: "button" } });
      button.toggleClass("is-active", get().widthMode === value);
      button.disabled = this.fixedLayout;
      button.addEventListener("click", () => {
        this.plugin.updateReaderSettings({ widthMode: value });
        for (const candidate of Array.from(width.querySelectorAll("button"))) candidate.toggleClass("is-active", candidate === button);
      });
    }

    const actions = panel.createDiv({ cls: "omni-book-reader-quick-settings-actions" });
    const full = actions.createEl("button", { text: t("完整设置", "Full settings"), attr: { type: "button" } });
    full.addEventListener("click", () => new ReaderSettingsModal(this.app, this.plugin, this.fixedLayout).open());
    const reset = actions.createEl("button", { text: t("恢复默认", "Restore defaults"), attr: { type: "button" } });
    reset.addEventListener("click", () => {
      this.plugin.updateReaderSettings({
        font: "obsidian",
        fontSizePercent: 100,
        lineHeight: 1.7,
        letterSpacing: 0.01,
        paragraphSpacing: 0.65,
        widthMode: "standard",
        contentWidth: 720,
        pageMargin: 48,
      });
      this.quickSettingsEl?.remove();
      this.quickSettingsEl = this.buildQuickSettings(parent);
      this.quickSettingsEl.addClass("is-open");
    });
    return panel;
  }

  private toggleQuickSettings(force?: boolean): void {
    this.quickSettingsOpen = force ?? !this.quickSettingsOpen;
    this.quickSettingsEl?.toggleClass("is-open", this.quickSettingsOpen);
    this.quickSettingsButton?.toggleClass("is-active", this.quickSettingsOpen);
    this.quickSettingsButton?.setAttribute("aria-expanded", String(this.quickSettingsOpen));
  }

  private buildSidebar(parent: HTMLElement): HTMLElement {
    const t = (zh: string, en: string): string => this.text(zh, en);
    const sidebar = parent.createEl("aside", { cls: "omni-book-reader-sidebar", attr: { "aria-label": t("Omni Book Reader 阅读侧栏", "Omni Book Reader reader sidebar") } });
    const bookHeader = sidebar.createDiv({ cls: "omni-book-reader-sidebar-book" });
    const cover = bookHeader.createDiv({ cls: "omni-book-reader-sidebar-cover" });
    this.sidebarCoverEl = cover;
    setIcon(cover, "book-open");
    this.sidebarCoverMarkEl = cover.createSpan({ text: "O" });
    const identity = bookHeader.createDiv({ cls: "omni-book-reader-sidebar-identity" });
    this.sidebarBookTitleEl = identity.createDiv({ cls: "omni-book-reader-sidebar-book-title", text: "Omni Book Reader" });
    this.sidebarBookAuthorEl = identity.createDiv({ cls: "omni-book-reader-sidebar-book-author", text: t("正在载入书籍信息…", "Loading book information…") });
    const progressRow = identity.createDiv({ cls: "omni-book-reader-sidebar-progress-row" });
    this.sidebarProgressEl = progressRow.createEl("input", {
      cls: "omni-book-reader-sidebar-progress",
      type: "range",
      attr: { min: "0", max: "1", step: "0.001", value: "0", "aria-label": t("跳转阅读进度", "Jump to reading progress") },
    });
    this.sidebarProgressTextEl = progressRow.createSpan({ cls: "omni-book-reader-sidebar-progress-text", text: "0%" });
    this.sidebarProgressEl.addEventListener("input", () => {
      this.sidebarProgressTextEl?.setText(percentage(Number(this.sidebarProgressEl?.value ?? 0)));
    });
    this.sidebarProgressEl.addEventListener("change", () => {
      if (this.sidebarProgressEl) void this.reader?.goToFraction(Number(this.sidebarProgressEl.value));
    });

    const searchBox = sidebar.createDiv({ cls: "omni-book-reader-sidebar-search" });
    const searchIcon = searchBox.createSpan();
    setIcon(searchIcon, "search");
    this.searchInputEl = searchBox.createEl("input", {
      type: "search",
      attr: { placeholder: t("搜索正文…", "Search text…"), "aria-label": t("搜索当前书籍正文", "Search this book") },
    });
    this.searchInputEl.addEventListener("input", () => {
      this.activateTab(this.searchInputEl?.value.trim() ? "search" : "toc");
      this.scheduleSearch();
    });

    const tabs = sidebar.createDiv({ cls: "omni-book-reader-tabs", attr: { role: "tablist" } });
    const definitions: Array<[SidebarTab, string, string]> = [
      ["toc", "list-tree", t("目录", "Contents")],
      ["highlights", "highlighter", t("摘录", "Annotations")],
      ["bookmarks", "bookmark", t("书签", "Bookmarks")],
    ];
    for (const [tab, icon, label] of definitions) {
      const button = iconButton(tabs, icon, label);
      button.addClass("omni-book-reader-tab");
      button.setAttribute("role", "tab");
      button.createSpan({ cls: "omni-book-reader-tab-label", text: label });
      const count = button.createSpan({ cls: "omni-book-reader-tab-count", text: "0" });
      this.tabCountEls.set(tab, count);
      button.addEventListener("click", () => this.activateTab(tab));
      this.tabButtons.set(tab, button);
    }
    const closeSidebar = iconButton(tabs, "panel-left-close", t("隐藏侧栏", "Hide sidebar"));
    closeSidebar.addClass("omni-book-reader-sidebar-close");
    closeSidebar.addEventListener("click", () => this.setSidebarOpen(false));

    const panels = sidebar.createDiv({ cls: "omni-book-reader-panels" });
    this.tocPanelEl = this.createPanel(panels, "toc");
    const searchPanel = this.createPanel(panels, "search");
    this.searchStatusEl = searchPanel.createDiv({ cls: "omni-book-reader-search-status", text: t("输入关键词开始搜索", "Enter a keyword to search") });
    this.searchResultsEl = searchPanel.createDiv({ cls: "omni-book-reader-search-results" });
    this.bookmarkPanelEl = this.createPanel(panels, "bookmarks");
    this.highlightPanelEl = this.createPanel(panels, "highlights");
    return sidebar;
  }

  private createPanel(parent: HTMLElement, tab: SidebarTab): HTMLElement {
    const panel = parent.createDiv({ cls: "omni-book-reader-panel", attr: { role: "tabpanel" } });
    panel.dataset.tab = tab;
    this.tabPanels.set(tab, panel);
    return panel;
  }

  private async loadBook(file: TFile): Promise<void> {
    await this.ensureFoliateRuntimeCompatibility();
    const fileKey = `${file.path}:${file.stat.size}:${file.stat.mtime}`;
    if (this.reader && this.loadedFileKey === fileKey) return;
    const generation = ++this.loadGeneration;
    await this.cleanupReader(false);
    if (generation !== this.loadGeneration || !this.viewerEl) return;
    this.showLoading(
      this.text("正在读取 EPUB…", "Reading EPUB…"),
      0.1,
      this.text("正在从 Obsidian 文库读取文件", "Reading the file from the Obsidian vault"),
    );

    try {
      const binaries = await readEpubBinaryCandidates(this.app.vault, file, {
        validate: isReadableEpubArchive,
        isCancelled: () => generation !== this.loadGeneration,
      });
      if (generation !== this.loadGeneration) return;
      let reader: FoliateViewElement | null = null;
      let openedSource: File | null = null;
      let lastOpenError: unknown;
      const timeout = bookLoadTimeout(file.stat.size);
      for (const [candidateIndex, binary] of binaries.entries()) {
        this.showLoading(
          this.text("正在检查书籍结构…", "Checking book structure…"),
          0.28,
          this.text(`读取路径 ${candidateIndex + 1}/${binaries.length}`, `Read path ${candidateIndex + 1} of ${binaries.length}`),
        );
        const source = new File([binary], file.name, {
          type: "application/epub+zip",
          lastModified: file.stat.mtime,
        });
        const candidate = this.viewerEl.createEl("foliate-view");
        candidate.addClass("omni-book-reader-foliate-view", "is-loading");
        let book: FoliateBook | null = null;
        let sanitizerCleanup: (() => void) | null = null;
        try {
          book = await withLoadTimeout(createEpubBook(binary, ({ phase, loaded, total }) => {
            if (generation !== this.loadGeneration) return;
            const ratio = total > 0 ? Math.min(1, loaded / total) : 0;
            this.showLoading(
              phase === "archive"
                ? this.text("正在解包 EPUB…", "Unpacking EPUB…")
                : this.text("正在解析书籍信息…", "Parsing book metadata…"),
              phase === "archive" ? 0.3 + ratio * 0.24 : 0.56 + ratio * 0.08,
              phase === "archive" && total > 0
                ? this.text(`已检查 ${loaded}/${total} 个资源`, `Checked ${loaded} of ${total} resources`)
                : this.text("正在读取目录与章节", "Reading the table of contents and chapters"),
            );
          }), timeout, () => {
            if (generation === this.loadGeneration) {
              this.showLoading(
                this.text("这本书需要更长时间…", "This book is taking longer…"),
                0.52,
                this.text("仍在安全解析，请保持此页面打开", "Still parsing safely; keep this view open"),
              );
            }
          });
          if (generation !== this.loadGeneration) {
            book.destroy?.();
            candidate.remove();
            return;
          }
          this.showLoading(
            this.text("正在创建阅读页面…", "Creating reading pages…"),
            0.7,
            this.text("正在启动排版引擎", "Starting the layout engine"),
          );
          sanitizerCleanup = installPublicationSanitizer(book.transformTarget);
          await withLoadTimeout(candidate.open(book), timeout, () => {
            if (generation === this.loadGeneration) {
              this.showLoading(
                this.text("正在等待排版完成…", "Waiting for layout…"),
                0.76,
                this.text("复杂图片或字体可能需要更多时间", "Complex images or fonts may need more time"),
              );
            }
          });
          reader = candidate;
          openedSource = source;
          this.cleanupCallbacks.push(sanitizerCleanup);
          sanitizerCleanup = null;
          break;
        } catch (error) {
          sanitizerCleanup?.();
          lastOpenError = error;
          candidate.close?.();
          book?.destroy?.();
          candidate.remove();
        }
      }
      if (!reader) {
        throw lastOpenError instanceof Error
          ? lastOpenError
          : new Error("Unable to open EPUB payload", { cause: lastOpenError });
      }
      if (generation !== this.loadGeneration) {
        reader.close?.();
        return;
      }
      this.reader = reader;
      if (generation !== this.loadGeneration) return;

      this.attachReaderEvents(reader);
      this.fixedLayout = Boolean(reader.isFixedLayout || reader.book.rendition?.layout === "pre-paginated");
      this.bookState = this.plugin.store.ensureBook(file.path, { size: file.stat.size, mtime: file.stat.mtime });
      this.startReadingStats();
      this.bookTitle = formatLanguageValue(reader.book.metadata?.title) || file.basename;
      this.bookAuthor = formatLanguageValue(reader.book.metadata?.author);
      this.titleEl?.setText(this.bookTitle);
      this.sidebarBookTitleEl?.setText(this.bookTitle);
      this.sidebarBookAuthorEl?.setText(this.bookAuthor || this.text("作者信息未提供", "Author not provided"));
      this.sidebarCoverMarkEl?.setText(Array.from(this.bookTitle.trim())[0]?.toLocaleUpperCase("zh-CN") ?? "O");
      if (openedSource) void this.loadSidebarCover(reader, openedSource, generation);
      this.chapterEl?.setText(this.text("正在定位…", "Locating…"));
      this.renderToc(reader.book.toc ?? []);
      this.renderBookmarks();
      this.renderHighlights();
      this.applySettings();
      if (this.bookState.highlights.length || this.bookState.annotationDocuments) {
        await this.syncAnnotationDocuments();
        this.renderHighlights();
      }

      this.showLoading(
        this.text("正在恢复阅读位置…", "Restoring reading position…"),
        0.9,
        this.text("即将完成", "Almost ready"),
      );
      await withLoadTimeout(this.restorePosition(reader, this.bookState), timeout);
      if (generation !== this.loadGeneration) return;
      this.loadedFileKey = fileKey;
      reader.removeClass("is-loading");
      this.hideLoading();
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      console.error("[Omni Book Reader] Failed to open book", error);
      this.showLoadError(file, error);
    }
  }

  private async ensureFoliateRuntimeCompatibility(): Promise<void> {
    installBlobUrlRegistry();
    installDesktopFoliateIframeSandboxPatch(Platform.isMobile);
    installFoliateBlobIframePatch();
    await ensureFoliateViewModule();
  }

  private async loadSidebarCover(reader: FoliateViewElement, source: File, generation: number): Promise<void> {
    const coverEl = this.sidebarCoverEl;
    if (!coverEl) return;
    coverEl.removeClass("has-image");
    coverEl.querySelector("img")?.remove();
    if (this.sidebarCoverUrl) URL.revokeObjectURL(this.sidebarCoverUrl);
    this.sidebarCoverUrl = null;
    try {
      // Reuse the bookshelf's validated EPUB cover pipeline. It calls the
      // publication getCover() API first, then resolves XHTML cover pages.
      let blob = await extractEpubCover(source);
      if (!blob?.size) blob = await reader.book.getCover?.() ?? null;
      if (!blob?.size || generation !== this.loadGeneration || !coverEl.isConnected) return;
      const url = URL.createObjectURL(blob);
      this.sidebarCoverUrl = url;
      const image = coverEl.createEl("img");
      image.alt = this.text(`${this.bookTitle} 封面`, `${this.bookTitle} cover`);
      image.decoding = "async";
      image.src = url;
      image.addEventListener("load", () => {
        if (generation === this.loadGeneration && image.isConnected) coverEl.addClass("has-image");
      }, { once: true });
      image.addEventListener("error", () => {
        image.remove();
        coverEl.removeClass("has-image");
        if (this.sidebarCoverUrl === url) {
          URL.revokeObjectURL(url);
          this.sidebarCoverUrl = null;
        }
      }, { once: true });
    } catch (error) {
      console.warn("[Omni Book Reader] Could not load reader sidebar cover", error);
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
          console.warn("[Omni Book Reader] Stored highlight could not be restored", error);
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
        console.warn("[Omni Book Reader] Could not preview footnote", error);
      });
    };
    const onFootnoteRender = (event: Event): void => {
      const detail = (event as CustomEvent<{ view: FoliateViewElement; href: string }>).detail;
      new FootnotePreviewModal(this.app, detail.view, detail.href, this.language(), async (href) => {
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
    const cfi = state.position?.cfi?.trim();
    if (cfi) {
      try {
        if (!reader.resolveNavigation(cfi)) throw new Error("Stored CFI cannot be resolved");
        await reader.goTo(cfi);
        return;
      } catch (error) {
        console.warn("[Omni Book Reader] Stored CFI could not be restored", error);
        new Notice(this.text("原阅读位置已失效，正在按进度恢复", "The saved location is no longer valid. Restoring by progress."));
      }
    }

    const fraction = state.position?.fraction;
    if (typeof fraction === "number" && Number.isFinite(fraction)) {
      try {
        await reader.goToFraction(Math.max(0, Math.min(1, fraction)));
        return;
      } catch (error) {
        console.warn("[Omni Book Reader] Progress position could not be restored", error);
      }
    }

    // Match Weave's final fallback: navigate the opened view directly instead
    // of re-running Foliate's init lifecycle after the renderer already exists.
    await reader.goToTextStart();
  }

  private attachDocumentEvents(document: Document, sectionIndex: number): void {
    if (this.attachedDocuments.has(document)) return;
    this.attachedDocuments.add(document);
    let selectionFrame: number | null = null;
    let selectionRetry: number | null = null;
    let touchStartPoint: { x: number; y: number; time: number; target: Element | null } | null = null;
    let selectingText = false;
    let touchStartedWithSelection = false;
    let suppressClickUntil = 0;
    let suppressPaginatorSelectionUntil = 0;
    const capture = (): void => {
      if (selectionFrame !== null) window.cancelAnimationFrame(selectionFrame);
      selectionFrame = window.requestAnimationFrame(() => {
        selectionFrame = null;
        this.captureSelection(document, sectionIndex);
      });
    };
    const pointerDown = (event: PointerEvent): void => {
      this.noteReadingActivity();
      if (!shouldIsolatePaginatorPointer(event.pointerType)) return;
      // Foliate auto-pages every 700ms while a pointer selection crosses the
      // visible range. Native touch handles already manage that selection.
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const pointerUp = (event: PointerEvent): void => {
      this.noteReadingActivity();
      if (shouldIsolatePaginatorPointer(event.pointerType)) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      capture();
    };
    const touchStart = (event: TouchEvent): void => {
      selectingText = false;
      suppressPaginatorSelectionUntil = Number.POSITIVE_INFINITY;
      const selection = document.defaultView?.getSelection?.() ?? document.getSelection?.();
      touchStartedWithSelection = Boolean(this.pendingSelection || (selection && !selection.isCollapsed));
      const touch = event.changedTouches.item(0);
      touchStartPoint = !touchStartedWithSelection && event.touches.length === 1 && touch
        && this.canUseDocumentPageTurn(event.target as Element | null, document) ? {
        x: touch.clientX,
        y: touch.clientY,
        time: event.timeStamp,
        target: event.target as Element | null,
      } : null;
      if (touchStartedWithSelection) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };
    const touchMove = (event: TouchEvent): void => {
      if (event.touches.length !== 1) return;
      if (touchStartedWithSelection) {
        selectingText = true;
        // Keep the native selection default, but do not let Foliate interpret
        // a briefly collapsed selection as a horizontal paginator drag.
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (!touchStartPoint) return;
      const selection = document.defaultView?.getSelection?.() ?? document.getSelection?.();
      if (selection && !selection.isCollapsed) {
        selectingText = true;
        touchStartPoint = null;
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const touchEnd = (event: TouchEvent): void => {
      this.noteReadingActivity();
      suppressPaginatorSelectionUntil = event.timeStamp + 700;
      const start = touchStartPoint;
      const touch = event.changedTouches.item(0);
      touchStartPoint = null;
      const selection = document.defaultView?.getSelection?.() ?? document.getSelection?.();
      const hasTextSelection = isTextSelectionGesture(
        touchStartedWithSelection,
        selectingText,
        Boolean(selection && !selection.isCollapsed),
      );
      touchStartedWithSelection = false;
      selectingText = false;
      if (!start || !touch) {
        if (hasTextSelection) {
          suppressClickUntil = event.timeStamp + 700;
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
        capture();
        return;
      }
      const end = {
        x: touch.clientX,
        y: touch.clientY,
        time: event.timeStamp,
      };
      if (shouldSuppressTouchPageTurn(start, end, hasTextSelection)) {
        suppressClickUntil = event.timeStamp + 700;
        capture();
        if (selectionRetry !== null) window.clearTimeout(selectionRetry);
        selectionRetry = window.setTimeout(() => {
          selectionRetry = null;
          capture();
        }, 140);
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      const swipeDirection = swipePageTurnDirection(start, end);
      const handled = swipeDirection
        ? (this.queuePageTurn(swipeDirection), true)
        : isPageTurnTap(start, end) && (
          this.openHighlightAtPoint(document, touch.clientX, touch.clientY)
          || this.handleDocumentTap(touch.clientX, start.target, document)
        );
      if (handled) {
        suppressClickUntil = event.timeStamp + 700;
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (end.time - start.time <= 550) suppressClickUntil = event.timeStamp + 700;
      capture();
      if (selectionRetry !== null) window.clearTimeout(selectionRetry);
      selectionRetry = window.setTimeout(() => {
        selectionRetry = null;
        capture();
      }, 140);
    };
    const touchCancel = (event: TouchEvent): void => {
      touchStartPoint = null;
      touchStartedWithSelection = false;
      selectingText = false;
      suppressPaginatorSelectionUntil = event.timeStamp + 700;
    };
    const keyDown = (event: KeyboardEvent): void => {
      this.noteReadingActivity();
      this.handleMobileHardwareKey(event);
      this.handleKeydown(event);
    };
    const keyUp = (): void => {
      this.noteReadingActivity();
      capture();
    };
    const selectionChange = (event: Event): void => {
      capture();
      if (event.timeStamp > suppressPaginatorSelectionUntil) return;
      // Foliate's bubbling listener repeatedly calls prev()/next() when a
      // touch selection crosses its last visible range.
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const wheel = (event: WheelEvent): void => this.handleWheel(event);
    const click = (event: MouseEvent): void => {
      if (event.timeStamp <= suppressClickUntil) return;
      const target = event.target as Element | null;
      const image = target?.closest?.("img");
      if (image) {
        const source = image.currentSrc || image.src || image.getAttribute("src") || "";
        if (!source.startsWith("blob:") && !source.startsWith("data:")) return;
        event.preventDefault();
        event.stopPropagation();
        this.openImagePreview(source, image.getAttribute("alt") ?? "");
        return;
      }
      if (event.defaultPrevented || event.button !== 0 || event.detail === 0) return;
      if (this.openHighlightAtPoint(document, event.clientX, event.clientY)) {
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (!this.handleDocumentTap(event.clientX, target, document)) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointerup", pointerUp, true);
    document.addEventListener("mouseup", capture);
    document.addEventListener("touchstart", touchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", touchMove, { capture: true, passive: false });
    document.addEventListener("touchend", touchEnd, { capture: true, passive: false });
    document.addEventListener("touchcancel", touchCancel, true);
    document.addEventListener("selectionchange", selectionChange, true);
    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("keyup", keyUp);
    document.addEventListener("wheel", wheel, { passive: false });
    document.addEventListener("click", click, true);
    this.cleanupCallbacks.push(() => {
      this.attachedDocuments.delete(document);
      if (selectionFrame !== null) window.cancelAnimationFrame(selectionFrame);
      if (selectionRetry !== null) window.clearTimeout(selectionRetry);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointerup", pointerUp, true);
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("touchstart", touchStart, true);
      document.removeEventListener("touchmove", touchMove, true);
      document.removeEventListener("touchend", touchEnd, true);
      document.removeEventListener("touchcancel", touchCancel, true);
      document.removeEventListener("selectionchange", selectionChange, true);
      document.removeEventListener("keydown", keyDown, true);
      document.removeEventListener("keyup", keyUp);
      document.removeEventListener("wheel", wheel);
      document.removeEventListener("click", click, true);
    });
  }

  private canUseDocumentPageTurn(target: Element | null, document: Document): boolean {
    if (!this.reader || !this.plugin.getReaderSettings().tapToTurnPages) return false;
    if (!this.fixedLayout && this.plugin.getReaderSettings().layout !== "paginated") return false;
    if (target?.closest?.(
      "a, button, input, textarea, select, option, label, summary, details, img, svg, video, audio, iframe, [contenteditable='true'], [role='button'], [role='link']",
    )) return false;
    const selection = document.defaultView?.getSelection?.() ?? document.getSelection?.();
    return !this.pendingSelection && !(selection && !selection.isCollapsed);
  }

  private openHighlightAtPoint(document: Document, clientX: number, clientY: number): boolean {
    const selection = document.defaultView?.getSelection?.() ?? document.getSelection?.();
    if (selection && !selection.isCollapsed) return false;
    const value = annotationValueAtPoint(this.reader?.renderer, document, clientX, clientY);
    const highlight = this.bookState?.highlights.find((item) => item.cfi === value);
    if (!highlight) return false;
    this.openHighlightActions(highlight);
    return true;
  }

  private handleDocumentTap(clientX: number, target: Element | null, document: Document): boolean {
    if (!this.canUseDocumentPageTurn(target, document)) return false;
    const viewerRect = this.viewerEl?.getBoundingClientRect();
    if (!viewerRect?.width) return false;
    const frame = document.defaultView?.frameElement as { getBoundingClientRect?: () => DOMRect } | null;
    const frameLeft = frame?.getBoundingClientRect?.().left ?? viewerRect.left;
    const direction = tapPageTurnDirection(frameLeft + clientX - viewerRect.left, viewerRect.width);
    if (!direction) return false;
    this.noteReadingActivity();
    this.queuePageTurn(direction);
    return true;
  }

  private queuePageTurn(direction: "previous" | "next"): void {
    if (!this.reader) return;
    if (this.pageTurnRunning) {
      this.pendingPageTurn = direction;
      return;
    }
    const runId = ++this.pageTurnRunId;
    this.pageTurnRunning = true;
    const run = async (): Promise<void> => {
      let currentDirection: "previous" | "next" | null = direction;
      try {
        while (currentDirection && runId === this.pageTurnRunId) {
          const reader = this.reader;
          const generation = this.loadGeneration;
          if (!reader) break;
          this.pendingPageTurn = null;
          await (currentDirection === "next" ? reader.goRight() : reader.goLeft());
          if (reader !== this.reader || generation !== this.loadGeneration) break;
          currentDirection = this.pendingPageTurn;
        }
      } catch (error) {
        console.warn("[Omni Book Reader] Could not turn the page", error);
      } finally {
        if (runId === this.pageTurnRunId) {
          this.pageTurnRunning = false;
          this.pendingPageTurn = null;
        }
      }
    };
    void run();
  }

  async exportCurrentChapter(): Promise<void> {
    if (!this.reader || !this.file || !this.bookState) {
      new Notice(this.text("请先打开一本 EPUB", "Open an EPUB first"));
      return;
    }
    const resolvedIndex = this.currentLocation.cfi
      ? this.reader.resolveNavigation(this.currentLocation.cfi)?.index
      : undefined;
    const contents = this.reader.renderer.getContents?.() ?? [];
    const content = contents.find((item) => item.index === resolvedIndex) ?? contents[0];
    if (!content) {
      new Notice(this.text("当前章节尚未加载完成", "The current chapter has not finished loading"));
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
      new Notice(this.text("当前章节已导出为 Markdown", "Current chapter exported as Markdown"));
    } catch (error) {
      console.error("[Omni Book Reader] Chapter export failed", error);
      new Notice(error instanceof Error
        ? this.text(`章节导出失败：${error.message}`, `Chapter export failed: ${error.message}`)
        : this.text("章节导出失败", "Chapter export failed"));
    }
  }

  private openImagePreview(source: string, alt: string): void {
    if (!this.file) return;
    new ImagePreviewModal(this.app, source, alt, this.language(), async (blob) => {
      const parent = this.file?.parent?.path ?? "";
      const folder = `${parent}/${this.file?.basename ?? "EPUB"}/图片`;
      const base = safeFileName(alt || `${this.currentChapter()}-${Date.now()}`, this.text("书内图片", "book-image"));
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

  async toggleFocusMode(force?: boolean): Promise<void> {
    const enabled = force ?? !this.focusMode;
    if (enabled === this.focusMode) return;
    this.focusMode = enabled;
    this.rootEl?.toggleClass("is-focus-mode", enabled);
    this.focusButton?.toggleClass("is-active", enabled);
    document.body.classList.toggle("omni-book-reader-immersive-mode", enabled);
    document.documentElement.classList.toggle("omni-book-reader-immersive-mode", enabled);
    if (!enabled) {
      this.setSidebarOpen(this.sidebarOpenBeforeFocus);
      if (this.ownsFullscreen && document.fullscreenElement) {
        this.ownsFullscreen = false;
        try { await document.exitFullscreen?.(); }
        catch (error) { console.warn("[Omni Book Reader] Could not exit fullscreen", error); }
      }
      window.requestAnimationFrame(() => this.applySettings());
      return;
    }
    this.sidebarOpenBeforeFocus = this.sidebarOpen;
    this.setSidebarOpen(false);
    this.rootEl?.focus({ preventScroll: true });
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      this.ownsFullscreen = document.fullscreenElement === document.documentElement;
    } catch (error) {
      this.ownsFullscreen = false;
      console.warn("[Omni Book Reader] Fullscreen API unavailable; using immersive overlay", error);
    }
    window.requestAnimationFrame(() => this.applySettings());
  }

  private handleFullscreenChange(): void {
    if (!document.fullscreenElement && this.focusMode && this.ownsFullscreen) {
      this.ownsFullscreen = false;
      this.focusMode = false;
      this.rootEl?.removeClass("is-focus-mode");
      this.focusButton?.removeClass("is-active");
      document.body.classList.remove("omni-book-reader-immersive-mode");
      document.documentElement.classList.remove("omni-book-reader-immersive-mode");
      this.setSidebarOpen(this.sidebarOpenBeforeFocus);
    }
    window.requestAnimationFrame(() => this.applySettings());
  }

  private captureSelection(document: Document, sectionIndex: number): void {
    if (!this.reader) return;
    const selection = document.defaultView?.getSelection?.() ?? document.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      if (this.pendingSelection) {
        if (this.selectionClearTimer !== null) window.clearTimeout(this.selectionClearTimer);
        this.selectionClearTimer = window.setTimeout(() => {
          this.selectionClearTimer = null;
          const current = document.defaultView?.getSelection?.() ?? document.getSelection?.();
          if (!current || current.rangeCount === 0 || current.isCollapsed) this.clearPendingSelection(false);
        }, 300);
      } else {
        this.clearPendingSelection(false);
      }
      return;
    }
    if (this.selectionClearTimer !== null) window.clearTimeout(this.selectionClearTimer);
    this.selectionClearTimer = null;
    const text = selection.toString().replace(/\s+/g, " ").trim();
    if (!text) return;
    if (text.length > 10000) {
      new Notice(this.text("单次高亮不能超过 10,000 个字符", "A highlight cannot exceed 10,000 characters"));
      this.clearPendingSelection();
      return;
    }
    try {
      const range = selection.getRangeAt(0).cloneRange();
      const cfi = this.reader.getCFI(sectionIndex, range);
      this.pendingSelection = { cfi, text, sectionIndex, selection };
      this.selectionToolbarEl?.addClass("is-visible");
    } catch (error) {
      console.warn("[Omni Book Reader] Could not create CFI for selection", error);
      this.clearPendingSelection();
    }
  }

  private async commitHighlight(color: HighlightColor, style: HighlightStyle): Promise<void> {
    if (!this.pendingSelection || !this.bookState || !this.reader) return;
    const pending = this.connectAdjacentHighlights(this.pendingSelection, color, style);
    const existing = pending.connected[0];
    for (const highlight of pending.connected) {
      await this.reader.deleteAnnotation({ value: highlight.cfi });
    }
    if (pending.connected.length) {
      const connected = new Set(pending.connected);
      this.bookState.highlights = this.bookState.highlights.filter((item) => !connected.has(item));
    }
    if (existing) {
      existing.cfi = pending.cfi;
      existing.color = color;
      existing.style = style;
      existing.text = pending.text;
      existing.tags = Array.from(new Set(pending.connected.flatMap((item) => item.tags)));
      const notes = Array.from(new Set(pending.connected
        .map((item) => item.note?.trim())
        .filter((note): note is string => Boolean(note))));
      if (notes.length) {
        existing.note = notes.join("\n\n");
        existing.noteUpdatedAt = Math.max(...pending.connected.map((item) => item.noteUpdatedAt ?? 0));
      } else {
        delete existing.note;
        delete existing.noteUpdatedAt;
      }
      this.bookState.highlights.unshift(existing);
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

  private connectAdjacentHighlights(
    pending: PendingSelection,
    color: HighlightColor,
    style: HighlightStyle,
  ): { cfi: string; text: string; sectionIndex: number; connected: ReaderHighlight[] } {
    const fallback = {
      cfi: pending.cfi,
      text: pending.text,
      sectionIndex: pending.sectionIndex,
      connected: this.bookState?.highlights.filter((item) => item.cfi === pending.cfi) ?? [],
    };
    const document = pending.selection.anchorNode?.ownerDocument;
    if (!document || !this.reader || !this.bookState || !pending.selection.rangeCount) return fallback;

    const candidates = this.bookState.highlights
      .filter((item) => !item.stale && item.sectionIndex === pending.sectionIndex)
      .filter((item) => item.cfi === pending.cfi || (item.color === color && item.style === style))
      .sort((left, right) => Number(right.cfi === pending.cfi) - Number(left.cfi === pending.cfi))
      .flatMap((item) => {
        const navigation = this.reader?.resolveNavigation(item.cfi);
        if (navigation?.index !== pending.sectionIndex || typeof navigation.anchor !== "function") return [];
        const anchor = navigation.anchor as (ownerDocument: Document) => unknown;
        const range = anchor(document);
        return isDomRange(range) ? [{ value: item, range }] : [];
      });

    const connection = connectAdjacentHighlightRanges(
      pending.selection.getRangeAt(0),
      candidates,
    );
    if (!connection.connected.length) return fallback;
    const text = connection.range.toString().replace(/\s+/g, " ").trim();
    const notes = Array.from(new Set(connection.connected
      .map((item) => item.note?.trim())
      .filter((note): note is string => Boolean(note))));
    if (!text || text.length > 10000 || notes.join("\n\n").length > 20000) return fallback;

    try {
      return {
        cfi: this.reader.getCFI(pending.sectionIndex, connection.range),
        text,
        sectionIndex: pending.sectionIndex,
        connected: connection.connected,
      };
    } catch (error) {
      console.warn("[Omni Book Reader] Could not connect adjacent highlights", error);
      return fallback;
    }
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
    new Notice(this.text("已删除高亮", "Highlight deleted"));
  }

  private openHighlightActions(highlight: ReaderHighlight): void {
    new HighlightActionsModal(
      this.app,
      highlight,
      this.language(),
      async (edit) => this.saveHighlightEdit(highlight, edit),
      async () => this.deleteHighlight(highlight),
    ).open();
  }

  private async saveHighlightEdit(highlight: ReaderHighlight, edit: HighlightEdit): Promise<void> {
    const note = edit.note.replace(/\r\n?/g, "\n").trim();
    if (note.length > 20000) throw new Error(this.text("单条笔记不能超过 20,000 个字符", "A note cannot exceed 20,000 characters"));
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
    new Notice(note ? this.text("标注与笔记已保存", "Annotation and note saved") : this.text("标注已保存", "Annotation saved"));
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
      console.error("[Omni Book Reader] Could not sync annotation documents", error);
      new Notice(error instanceof Error
        ? this.text(`无法同步高亮与笔记文档：${error.message}`, `Could not sync highlight and note documents: ${error.message}`)
        : this.text("无法同步高亮与笔记文档", "Could not sync highlight and note documents"));
      return false;
    }
  }

  private clearPendingSelection(clearNative = true): void {
    if (this.selectionClearTimer !== null) window.clearTimeout(this.selectionClearTimer);
    this.selectionClearTimer = null;
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
    if (this.sidebarProgressEl) this.sidebarProgressEl.value = String(fraction);
    this.sidebarProgressTextEl?.setText(percentage(fraction));
    const chapter = this.currentChapter();
    this.chapterEl?.setText(chapter);
    const page = formatLanguageValue(location.pageItem?.label);
    const loc = location.location?.current;
    const total = location.location?.total;
    const locationText = page
      ? this.text(`第 ${page} 页`, `Page ${page}`)
      : loc && total
        ? this.text(`第 ${loc} / ${total} 页`, `Page ${loc} / ${total}`)
        : loc ? this.text(`位置 ${loc}`, `Location ${loc}`) : "";
    this.locationTextEl?.setText(locationText);
    this.immersiveLocationEl?.setText(locationText || this.text("正在定位", "Locating"));
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
    return formatLanguageValue(this.currentLocation.tocItem?.label) || this.text("未命名章节", "Untitled chapter");
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
    const language = this.language();
    this.readingStatsEl?.setText(this.text(
      `本次 ${duration(this.sessionReadingMs, language)}${estimate ? ` · 剩余约 ${duration(estimate, language)}` : ""}`,
      `This session ${duration(this.sessionReadingMs, language)}${estimate ? ` · about ${duration(estimate, language)} left` : ""}`,
    ));
  }

  openReadingStats(): void {
    this.tickReadingStats();
    const stats = this.bookState?.readingStats;
    if (!stats) {
      new Notice(this.text("暂无阅读统计", "No reading statistics yet"));
      return;
    }
    new ReadingStatsModal(this.app, stats, this.sessionReadingMs, this.language(), () => {
      if (stats.completedAt) delete stats.completedAt;
      else stats.completedAt = Date.now();
      this.plugin.store.markChanged(0);
    }).open();
  }

  private renderToc(items: FoliateTocItem[]): void {
    if (!this.tocPanelEl) return;
    this.tocPanelEl.empty();
    this.tocLinks.clear();
    const countItems = (entries: FoliateTocItem[]): number => entries.reduce((total, item) => total + 1 + countItems(item.subitems ?? []), 0);
    this.tabCountEls.get("toc")?.setText(String(countItems(items)));
    if (!items.length) {
      this.tocPanelEl.createDiv({ cls: "omni-book-reader-empty", text: this.text("此书没有可用目录", "This book has no table of contents") });
      return;
    }
    this.renderTocLevel(this.tocPanelEl, items, 0);
  }

  private renderTocLevel(parent: HTMLElement, items: FoliateTocItem[], depth: number): void {
    const list = parent.createEl("ul", { cls: "omni-book-reader-toc-list" });
    for (const item of items) {
      const row = list.createEl("li");
      const label = formatLanguageValue(item.label) || this.text("未命名章节", "Untitled chapter");
      const button = row.createEl("button", { cls: "omni-book-reader-list-button", attr: { type: "button", "data-depth": String(depth) } });
      button.style.setProperty("--omni-book-reader-toc-indent", `${Math.min(depth, 4) * 12}px`);
      button.createSpan({ cls: "omni-book-reader-toc-dot", attr: { "aria-hidden": "true" } });
      button.createSpan({ cls: "omni-book-reader-toc-label", text: label });
      const marker = button.createSpan({ cls: "omni-book-reader-toc-current-marker", text: this.text("当前", "Current") });
      marker.setAttribute("aria-hidden", "true");
      if (item.href) {
        this.tocLinks.set(item.href, button);
        button.addEventListener("click", () => {
          void this.reader?.goTo(item.href as string);
          if (Platform.isMobile) this.setSidebarOpen(false);
        });
      } else {
        button.disabled = true;
      }
      if (item.subitems?.length) {
        row.addClass("has-children");
        this.renderTocLevel(row, item.subitems, depth + 1);
      }
    }
  }

  private updateCurrentToc(href: string | undefined): void {
    for (const button of this.tocLinks.values()) {
      button.removeClass("is-current");
      button.closest("li")?.classList.remove("has-current-child");
    }
    const current = href ? this.tocLinks.get(href) : undefined;
    current?.addClass("is-current");
    let ancestor = current?.closest("li")?.parentElement?.closest("li");
    while (ancestor) {
      ancestor.classList.add("has-current-child");
      ancestor = ancestor.parentElement?.closest("li") ?? null;
    }
  }

  private renderBookmarks(): void {
    if (!this.bookmarkPanelEl) return;
    this.bookmarkPanelEl.empty();
    const items = this.bookState?.bookmarks ?? [];
    this.tabCountEls.get("bookmarks")?.setText(String(items.length));
    if (!items.length) {
      this.bookmarkPanelEl.createDiv({ cls: "omni-book-reader-empty", text: this.text("还没有书签", "No bookmarks yet") });
      return;
    }
    for (const bookmark of items) this.renderBookmarkItem(this.bookmarkPanelEl, bookmark);
  }

  private renderBookmarkItem(parent: HTMLElement, bookmark: Bookmark): void {
    const row = parent.createDiv({ cls: `omni-book-reader-saved-item${bookmark.stale ? " is-stale" : ""}` });
    const open = row.createEl("button", { cls: "omni-book-reader-saved-content", attr: { type: "button" } });
    open.createDiv({ cls: "omni-book-reader-saved-title", text: bookmark.chapter });
    open.createDiv({ cls: "omni-book-reader-saved-meta", text: `${percentage(bookmark.fraction)} · ${new Date(bookmark.createdAt).toLocaleDateString(uiLocale(this.language()))}` });
    open.addEventListener("click", () => void this.navigateSavedLocation(bookmark));
    const remove = iconButton(row, "trash-2", this.text("删除书签", "Delete bookmark"));
    remove.addEventListener("click", () => {
      if (!this.bookState) return;
      this.bookState.bookmarks = this.bookState.bookmarks.filter((item) => item.id !== bookmark.id);
      this.plugin.store.markChanged(0);
      this.renderBookmarks();
      this.updateBookmarkButton();
    });
  }

  private renderHighlights(): void {
    const t = (zh: string, en: string): string => this.text(zh, en);
    if (!this.highlightPanelEl) return;
    this.highlightPanelEl.empty();
    const items = this.bookState?.highlights ?? [];
    this.tabCountEls.get("highlights")?.setText(String(items.length));
    const documents = this.bookState?.annotationDocuments;
    if (documents) {
      const actions = this.highlightPanelEl.createDiv({ cls: "omni-book-reader-document-actions" });
      const exportHighlights = actions.createEl("button", { text: t("导出高亮", "Export highlights"), attr: { type: "button", "aria-label": t("导出全部高亮摘抄", "Export all highlights") } });
      exportHighlights.addEventListener("click", () => void this.exportAnnotations("highlights"));
      const exportNotes = actions.createEl("button", { text: t("导出笔记", "Export notes"), attr: { type: "button", "aria-label": t("导出全部高亮笔记", "Export all highlight notes") } });
      exportNotes.addEventListener("click", () => void this.exportAnnotations("notes"));
    }
    if (!items.length) {
      this.highlightPanelEl.createDiv({ cls: "omni-book-reader-empty", text: t("选中文字即可创建高亮", "Select text to create a highlight") });
      return;
    }
    const availableTags = Array.from(new Set(items.flatMap((highlight) => highlight.tags))).sort((left, right) => left.localeCompare(right, "zh-CN"));
    const availableChapters = Array.from(new Set(items.map((highlight) => highlight.chapter))).sort((left, right) => left.localeCompare(right, "zh-CN"));
    if (this.highlightTagFilter && !availableTags.includes(this.highlightTagFilter)) this.highlightTagFilter = "";
    if (this.highlightChapterFilter && !availableChapters.includes(this.highlightChapterFilter)) this.highlightChapterFilter = "";
    const filter = this.highlightPanelEl.createDiv({ cls: "omni-book-reader-highlight-filter" });
    const tagSelect = filter.createEl("select", { attr: { "aria-label": t("按标签筛选标注", "Filter annotations by tag") } });
    tagSelect.createEl("option", { text: t("全部标签", "All tags"), value: "" });
    for (const tag of availableTags) tagSelect.createEl("option", { text: tag, value: tag });
    tagSelect.value = this.highlightTagFilter;
    tagSelect.disabled = !availableTags.length;
    tagSelect.addEventListener("change", () => {
      this.highlightTagFilter = tagSelect.value;
      this.renderHighlights();
    });
    const chapterSelect = filter.createEl("select", { attr: { "aria-label": t("按章节筛选标注", "Filter annotations by chapter") } });
    chapterSelect.createEl("option", { text: t("全部章节", "All chapters"), value: "" });
    for (const chapter of availableChapters) chapterSelect.createEl("option", { text: chapter, value: chapter });
    chapterSelect.value = this.highlightChapterFilter;
    chapterSelect.addEventListener("change", () => {
      this.highlightChapterFilter = chapterSelect.value;
      this.renderHighlights();
    });
    const colorSelect = filter.createEl("select", { attr: { "aria-label": t("按颜色筛选标注", "Filter annotations by color") } });
    colorSelect.createEl("option", { text: t("全部颜色", "All colors"), value: "" });
    for (const [color, definition] of Object.entries(HIGHLIGHT_COLORS) as Array<[HighlightColor, typeof HIGHLIGHT_COLORS[HighlightColor]]>) {
      colorSelect.createEl("option", { text: this.definitionLabel(definition), value: color });
    }
    colorSelect.value = this.highlightColorFilter;
    colorSelect.addEventListener("change", () => {
      this.highlightColorFilter = colorSelect.value as HighlightColor | "";
      this.renderHighlights();
    });
    const noteSelect = filter.createEl("select", { attr: { "aria-label": t("按笔记状态筛选标注", "Filter annotations by note status") } });
    for (const [value, text] of [["all", t("全部笔记状态", "All note statuses")], ["with-note", t("有笔记", "With notes")], ["without-note", t("无笔记", "Without notes")]]) {
      noteSelect.createEl("option", { value, text });
    }
    noteSelect.value = this.highlightNoteFilter;
    noteSelect.addEventListener("change", () => {
      this.highlightNoteFilter = noteSelect.value as HighlightNoteFilter;
      this.renderHighlights();
    });
    const sortSelect = filter.createEl("select", { attr: { "aria-label": t("标注排序", "Sort annotations") } });
    for (const [value, text] of [["newest", t("最新创建", "Newest")], ["oldest", t("最早创建", "Oldest")], ["chapter", t("按章节", "By chapter")]]) {
      sortSelect.createEl("option", { value, text });
    }
    sortSelect.value = this.highlightSort;
    sortSelect.addEventListener("change", () => {
      this.highlightSort = sortSelect.value as HighlightSort;
      this.renderHighlights();
    });
    const dateSelect = filter.createEl("select", { attr: { "aria-label": t("按创建时间筛选标注", "Filter annotations by creation date") } });
    for (const [value, text] of [["all", t("全部时间", "All time")], ["today", t("今天", "Today")], ["7d", t("最近 7 天", "Last 7 days")], ["30d", t("最近 30 天", "Last 30 days")]]) {
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
      this.highlightPanelEl.createDiv({ cls: "omni-book-reader-empty", text: t("没有匹配筛选条件的标注", "No annotations match these filters") });
      return;
    }
    for (const highlight of filteredItems) {
      const row = this.highlightPanelEl.createDiv({ cls: `omni-book-reader-saved-item is-highlight is-style-${highlight.style}${highlight.stale ? " is-stale" : ""}` });
      row.setCssProps({ "--highlight-color": HIGHLIGHT_COLORS[highlight.color].value });
      const open = row.createEl("button", { cls: "omni-book-reader-saved-content", attr: { type: "button" } });
      open.createDiv({ cls: "omni-book-reader-highlight-text", text: highlight.text });
      open.createDiv({ cls: "omni-book-reader-saved-meta", text: `${highlight.chapter} · ${this.definitionLabel(HIGHLIGHT_STYLES[highlight.style])}` });
      if (highlight.tags.length) {
        const tags = open.createDiv({ cls: "omni-book-reader-highlight-tags" });
        for (const tag of highlight.tags) tags.createSpan({ text: tag });
      }
      if (highlight.note) open.createDiv({ cls: "omni-book-reader-note-preview", text: highlight.note });
      open.addEventListener("click", () => void this.navigateSavedLocation(highlight));
      const note = iconButton(row, "notebook-pen", highlight.note ? t("编辑标注与笔记", "Edit annotation and note") : t("编辑标注并添加笔记", "Edit annotation and add note"));
      note.toggleClass("is-active", Boolean(highlight.note));
      note.addEventListener("click", () => this.openHighlightActions(highlight));
      const remove = iconButton(row, "trash-2", t("删除高亮", "Delete highlight"));
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
      new Notice(this.text("该定位已失效，数据已保留供你删除或检查", "This location is no longer valid. Its data was kept for review or deletion."));
      return;
    }
    item.stale = false;
    if (Platform.isMobile) this.setSidebarOpen(false);
  }

  private updateBookmarkButton(): void {
    const active = Boolean(this.currentLocation.cfi && this.bookState?.bookmarks.some((item) => item.cfi === this.currentLocation.cfi));
    this.bookmarkButton?.toggleClass("is-active", active);
    this.bookmarkButton?.setAttribute("aria-label", active ? this.text("移除当前位置书签", "Remove bookmark here") : this.text("添加当前位置书签", "Add bookmark here"));
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
      this.searchStatusEl.setText(this.text("输入关键词开始搜索", "Enter a keyword to search"));
      return;
    }
    this.searchStatusEl.setText(this.text("正在搜索 0%…", "Searching 0%…"));
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
          this.searchStatusEl.setText(this.text(`正在搜索 ${percentage(result.progress)}…已找到 ${count} 条`, `Searching ${percentage(result.progress)}… ${count} found`));
          continue;
        }
        const group = result;
        for (const item of group.subitems) {
          if (count >= 500) {
            truncated = true;
            break;
          }
          this.renderSearchResult(group.label || this.text("未命名章节", "Untitled chapter"), item);
          count += 1;
        }
        if (truncated) break;
      }
      if (this.searchSession.isActive(token)) {
        this.searchStatusEl.setText(truncated
          ? this.text("已显示前 500 条结果，请缩小关键词范围", "Showing the first 500 results. Narrow your search.")
          : this.text(`找到 ${count} 条结果`, `${count} results found`));
      }
    } catch (error) {
      if (this.searchSession.isActive(token)) {
        console.error("[Omni Book Reader] Search failed", error);
        this.searchStatusEl.setText(this.text("搜索失败，请重试", "Search failed. Try again."));
      }
    }
  }

  private renderSearchResult(label: string, item: FoliateSearchItem): void {
    if (!this.searchResultsEl) return;
    const button = this.searchResultsEl.createEl("button", { cls: "omni-book-reader-search-result", attr: { type: "button" } });
    button.createDiv({ cls: "omni-book-reader-search-result-title", text: label });
    button.createDiv({ cls: "omni-book-reader-search-result-excerpt", text: excerptToText(item.excerpt) || this.text("匹配内容", "Matching text") });
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
    if (event.defaultPrevented) return;
    if (isEditableTarget(event.target)) return;
    if (event.key === "Escape") {
      if (this.quickSettingsOpen) this.toggleQuickSettings(false);
      else if (this.pendingSelection) this.clearPendingSelection();
      else if (this.focusMode) void this.toggleFocusMode(false);
      else if (Platform.isMobile && this.sidebarOpen) this.setSidebarOpen(false);
      return;
    }
    if (!this.reader || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      this.queuePageTurn("previous");
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      this.queuePageTurn("next");
    } else if (event.key === "PageUp" || event.key === "Home") {
      event.preventDefault();
      if (event.key === "Home") void this.reader.goToFraction(0);
      else this.queuePageTurn("previous");
    } else if (event.key === "PageDown" || event.key === " " || event.key === "End") {
      event.preventDefault();
      if (event.key === "End") void this.reader.goToFraction(1);
      else this.queuePageTurn("next");
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
    this.queuePageTurn(forward ? "next" : "previous");
  }

  private handleMobileHardwareKey(event: KeyboardEvent): void {
    if (!Platform.isMobile || !this.reader || event.repeat || isEditableTarget(event.target)) return;
    if (!this.focusMode && this.app.workspace.getActiveViewOfType(OmniBookReaderView) !== this) return;
    const direction = mobilePageTurnDirection(event);
    if (!direction) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.noteReadingActivity();
    this.queuePageTurn(direction);
  }

  private showLoading(message: string, progress = 0, detail = ""): void {
    if (!this.viewerEl) return;
    if (!this.loadingEl?.isConnected || !this.loadingEl.querySelector(".omni-book-reader-loading-title")) {
      this.loadingEl?.remove();
      this.loadingEl = this.viewerEl.createDiv({
        cls: "omni-book-reader-loading",
        attr: { role: "status", "aria-live": "polite", "aria-busy": "true" },
      });
      this.loadingEl.createDiv({ cls: "omni-book-reader-loading-mark", attr: { "aria-hidden": "true" } });
      this.loadingEl.createDiv({ cls: "omni-book-reader-loading-title" });
      const track = this.loadingEl.createDiv({
        cls: "omni-book-reader-loading-track",
        attr: { role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" },
      });
      track.createDiv({ cls: "omni-book-reader-loading-bar" });
      this.loadingEl.createDiv({ cls: "omni-book-reader-loading-detail" });
    }
    const value = Math.max(0, Math.min(1, progress));
    this.loadingEl.querySelector<HTMLElement>(".omni-book-reader-loading-title")?.setText(message);
    this.loadingEl.querySelector<HTMLElement>(".omni-book-reader-loading-detail")?.setText(detail);
    const track = this.loadingEl.querySelector<HTMLElement>(".omni-book-reader-loading-track");
    track?.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    this.loadingEl.querySelector<HTMLElement>(".omni-book-reader-loading-bar")
      ?.style.setProperty("--omni-book-reader-load-progress", `${value * 100}%`);
  }

  private hideLoading(): void {
    this.loadingEl?.remove();
    this.loadingEl = null;
  }

  private showLoadError(file: TFile, error: unknown): void {
    if (!this.viewerEl) return;
    this.viewerEl.empty();
    const panel = this.viewerEl.createDiv({ cls: "omni-book-reader-error" });
    panel.createEl("h3", { text: this.text("无法打开这本 EPUB", "Could not open this EPUB") });
    panel.createEl("p", { text: error instanceof Error ? error.message : this.text("文件可能已损坏或格式不受支持。", "The file may be damaged or use an unsupported format.") });
    const retry = panel.createEl("button", { cls: "mod-cta", text: this.text("重试", "Retry") });
    retry.addEventListener("click", () => void this.loadBook(file));
  }

  private language(): InterfaceLanguage {
    return this.plugin.getReaderSettings().interfaceLanguage;
  }

  private text(zh: string, en: string): string {
    return uiText(this.language(), zh, en);
  }

  private definitionLabel(definition: { zh: string; en: string }): string {
    return uiText(this.language(), definition.zh, definition.en);
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
    if (this.sidebarCoverUrl) URL.revokeObjectURL(this.sidebarCoverUrl);
    this.sidebarCoverUrl = null;
    this.sidebarCoverEl?.removeClass("has-image");
    this.sidebarCoverEl?.querySelector("img")?.remove();
    await this.toggleFocusMode(false);
    for (const cleanup of this.cleanupCallbacks.splice(0)) {
      try { cleanup(); } catch { /* Ignore cleanup races. */ }
    }
    this.attachedDocuments = new WeakSet<Document>();
    const reader = this.reader;
    this.reader = null;
    this.pageTurnRunId += 1;
    this.pageTurnRunning = false;
    this.pendingPageTurn = null;
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
