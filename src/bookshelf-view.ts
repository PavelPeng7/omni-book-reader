import { FuzzySuggestModal, ItemView, Menu, Modal, Notice, TFile, WorkspaceLeaf, normalizePath, setIcon } from "obsidian";
import { extractEpubCover } from "./epub-cover";
import { uiLocale, uiText } from "./i18n";
import type { ReaderDataStore } from "./store";
import type { InterfaceLanguage, ReaderSettings } from "./types";

export const EPUB_BOOKSHELF_VIEW_TYPE = "pavel-epub-bookshelf-view";

export interface BookshelfHost {
  store: ReaderDataStore;
  getReaderSettings(): ReaderSettings;
  openEpub(file: TFile): Promise<void>;
}

interface ShelfBook {
  file: TFile;
  progress: number;
  lastOpenedAt: number;
  highlightCount: number;
  bookmarkCount: number;
  completed: boolean;
  inReadingList: boolean;
}

const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);

function fileSignature(file: TFile): string {
  return `${file.path}:${file.stat.size}:${file.stat.mtime}`;
}

function imageMimeType(file: TFile): string {
  if (file.extension === "jpg") return "image/jpeg";
  return `image/${file.extension || "png"}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

class ImagePickerModal extends FuzzySuggestModal<TFile> {
  constructor(app: import("obsidian").App, language: InterfaceLanguage, private readonly onChoose: (file: TFile) => void) {
    super(app);
    this.setPlaceholder(uiText(language, "搜索 Vault 中的图片", "Search images in the Vault"));
  }

  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((file) => IMAGE_EXTENSIONS.has(file.extension.toLowerCase()));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

class BookDetailsModal extends Modal {
  constructor(private readonly book: ShelfBook, app: import("obsidian").App, private readonly language: InterfaceLanguage) {
    super(app);
  }

  onOpen(): void {
    const t = (zh: string, en: string): string => uiText(this.language, zh, en);
    this.titleEl.setText(t("书籍完整信息", "Book details"));
    const state = this.book;
    const details: Array<[string, string]> = [
      [t("书名", "Title"), state.file.basename],
      [t("位置", "Location"), state.file.path],
      [t("文件大小", "File size"), formatBytes(state.file.stat.size)],
      [t("最近修改", "Last modified"), new Date(state.file.stat.mtime).toLocaleString(uiLocale(this.language))],
      [t("阅读进度", "Reading progress"), percent(state.progress)],
      [t("阅读状态", "Reading status"), state.completed ? t("已读完", "Finished") : t("阅读中", "Reading")],
      [t("最近阅读", "Last read"), state.lastOpenedAt ? new Date(state.lastOpenedAt).toLocaleString(uiLocale(this.language)) : t("尚未阅读", "Not read yet")],
      [t("高亮", "Highlights"), t(`${state.highlightCount} 条`, `${state.highlightCount}`)],
      [t("书签", "Bookmarks"), t(`${state.bookmarkCount} 个`, `${state.bookmarkCount}`)],
      [t("书单", "Reading list"), state.inReadingList ? t("已加入", "Added") : t("未加入", "Not added")],
    ];
    const list = this.contentEl.createDiv({ cls: "pavel-epub-book-details" });
    for (const [label, value] of details) {
      const row = list.createDiv({ cls: "pavel-epub-book-details-row" });
      row.createSpan({ text: label });
      row.createSpan({ text: value });
    }
  }

  onClose(): void { this.contentEl.empty(); }
}

class RenameBookModal extends Modal {
  constructor(app: import("obsidian").App, private readonly file: TFile, private readonly language: InterfaceLanguage, private readonly onSubmit: (name: string) => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    const t = (zh: string, en: string): string => uiText(this.language, zh, en);
    this.titleEl.setText(t("重命名书籍", "Rename book"));
    const input = this.contentEl.createEl("input", {
      type: "text",
      value: this.file.basename,
      attr: { "aria-label": t("新的书籍名称", "New book name") },
    });
    const actions = this.contentEl.createDiv({ cls: "pavel-epub-modal-actions" });
    const save = actions.createEl("button", { cls: "mod-cta", text: t("保存", "Save") });
    actions.createEl("button", { text: t("取消", "Cancel") }).addEventListener("click", () => this.close());
    const submit = async () => {
      const value = input.value.trim();
      if (!value) return new Notice(t("请输入书籍名称", "Enter a book name"));
      save.disabled = true;
      try {
        await this.onSubmit(value);
        this.close();
      } catch (error) {
        console.error("[OmniReader] Could not rename EPUB", error);
        new Notice(error instanceof Error ? error.message : t("重命名书籍失败", "Could not rename the book"));
      } finally {
        save.disabled = false;
      }
    };
    save.addEventListener("click", () => void submit());
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") void submit(); });
    input.focus();
    input.select();
  }

  onClose(): void { this.contentEl.empty(); }
}

class DeleteBookModal extends Modal {
  constructor(app: import("obsidian").App, private readonly file: TFile, private readonly language: InterfaceLanguage, private readonly onConfirm: () => Promise<void>) { super(app); }

  onOpen(): void {
    const t = (zh: string, en: string): string => uiText(this.language, zh, en);
    this.titleEl.setText(t("删除书籍文件？", "Delete book file?"));
    this.contentEl.createEl("p", { text: t(`“${this.file.basename}”将移入系统回收站。此操作不会删除其他笔记。`, `“${this.file.basename}” will be moved to the system trash. Other notes will not be deleted.`) });
    const actions = this.contentEl.createDiv({ cls: "pavel-epub-modal-actions" });
    actions.createEl("button", { text: t("取消", "Cancel") }).addEventListener("click", () => this.close());
    const remove = actions.createEl("button", { cls: "mod-warning", text: t("移入回收站", "Move to trash") });
    remove.addEventListener("click", () => void (async () => {
      remove.disabled = true;
      try { await this.onConfirm(); this.close(); } finally { remove.disabled = false; }
    })());
  }

  onClose(): void { this.contentEl.empty(); }
}

function percent(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function relativeTime(timestamp: number, language: InterfaceLanguage): string {
  const t = (zh: string, en: string): string => uiText(language, zh, en);
  if (!timestamp) return t("尚未阅读", "Not read yet");
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return t("刚刚阅读", "Just read");
  if (minutes < 60) return t(`${minutes} 分钟前`, `${minutes} min ago`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(`${hours} 小时前`, `${hours} hr ago`);
  const days = Math.floor(hours / 24);
  if (days < 30) return t(`${days} 天前`, `${days} days ago`);
  return new Date(timestamp).toLocaleDateString(uiLocale(language));
}

export class PavelEpubBookshelfView extends ItemView {
  private query = "";
  private listOnly = false;
  private coverCache = new Map<string, { signature: string; url: string | null }>();
  private coverLoads = new Map<string, Promise<string | null>>();
  private coverQueue: Promise<void> = Promise.resolve();
  private coverGeneration = 0;
  private closed = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: BookshelfHost) {
    super(leaf);
  }

  getViewType(): string {
    return EPUB_BOOKSHELF_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.text("OmniReader 书架", "OmniReader bookshelf");
  }

  getIcon(): string {
    return "library";
  }

  refresh(): void {
    if (!this.closed) this.render();
  }

  async onOpen(): Promise<void> {
    this.closed = false;
    this.containerEl.addClass("pavel-epub-bookshelf-container");
    this.registerEvent(this.app.vault.on("create", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.render()));
    this.render();
  }

  async onClose(): Promise<void> {
    this.closed = true;
    this.coverGeneration += 1;
    for (const cached of this.coverCache.values()) {
      if (cached.url) URL.revokeObjectURL(cached.url);
    }
    this.coverCache.clear();
    this.coverLoads.clear();
    this.contentEl.empty();
  }

  private getBooks(): ShelfBook[] {
    const states = this.plugin.store.snapshot.books;
    return this.app.vault.getFiles()
      .filter((file) => file.extension.toLowerCase() === "epub" && !states[file.path]?.hiddenFromBookshelf)
      .map((file) => {
        const state = states[file.path];
        return {
          file,
          progress: state?.position?.fraction ?? state?.readingStats?.furthestFraction ?? 0,
          lastOpenedAt: state?.readingStats?.lastOpenedAt ?? 0,
          highlightCount: state?.highlights.length ?? 0,
          bookmarkCount: state?.bookmarks.length ?? 0,
          completed: Boolean(state?.readingStats?.completedAt),
          inReadingList: Boolean(state?.inReadingList),
        };
      })
      .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt || left.file.basename.localeCompare(right.file.basename, "zh-CN"));
  }

  private render(): void {
    const t = (zh: string, en: string): string => this.text(zh, en);
    const content = this.contentEl;
    content.empty();
    content.addClass("pavel-epub-bookshelf");

    const allBooks = this.getBooks();
    this.releaseRemovedCovers(new Set(allBooks.map((book) => book.file.path)));
    const heading = content.createDiv({ cls: "pavel-epub-bookshelf-heading" });
    const titleGroup = heading.createDiv();
    titleGroup.createDiv({ cls: "pavel-epub-bookshelf-kicker", text: "OMNIREADER" });
    titleGroup.createEl("h2", { text: t("我的文库", "My library") });
    const count = heading.createDiv({ cls: "pavel-epub-bookshelf-count", text: String(allBooks.length) });
    count.setAttribute("aria-label", t(`${allBooks.length} 本 EPUB`, `${allBooks.length} EPUB books`));

    const summary = content.createDiv({ cls: "pavel-epub-bookshelf-summary" });
    const readingCount = allBooks.filter((book) => book.lastOpenedAt && !book.completed).length;
    const completedCount = allBooks.filter((book) => book.completed).length;
    summary.createSpan({ text: t(`${readingCount} 本在读`, `${readingCount} reading`) });
    summary.createSpan({ text: t(`${completedCount} 本读完`, `${completedCount} finished`) });

    const filters = content.createDiv({ cls: "pavel-epub-bookshelf-filters" });
    const allFilter = filters.createEl("button", { text: t("全部书籍", "All books"), attr: { type: "button", "aria-pressed": String(!this.listOnly) } });
    const listFilter = filters.createEl("button", { text: t("我的书单", "Reading list"), attr: { type: "button", "aria-pressed": String(this.listOnly) } });
    allFilter.toggleClass("is-active", !this.listOnly);
    listFilter.toggleClass("is-active", this.listOnly);
    allFilter.addEventListener("click", () => { this.listOnly = false; this.render(); });
    listFilter.addEventListener("click", () => { this.listOnly = true; this.render(); });

    const search = content.createDiv({ cls: "pavel-epub-bookshelf-search" });
    const searchIcon = search.createSpan();
    setIcon(searchIcon, "search");
    const input = search.createEl("input", {
      type: "search",
      attr: { placeholder: t("搜索书名或路径", "Search titles or paths"), "aria-label": t("搜索 OmniReader 书架", "Search the OmniReader bookshelf") },
    });
    input.value = this.query;
    input.addEventListener("input", () => {
      this.query = input.value;
      this.renderBookList(list, empty, allBooks);
    });

    const section = content.createDiv({ cls: "pavel-epub-bookshelf-section" });
    section.createDiv({ cls: "pavel-epub-bookshelf-section-title", text: this.listOnly ? t("我的书单", "Reading list") : t("全部书籍", "All books") });
    const list = section.createDiv({ cls: "pavel-epub-bookshelf-list" });
    const empty = section.createDiv({ cls: "pavel-epub-bookshelf-empty" });
    this.renderBookList(list, empty, allBooks);
  }

  private renderBookList(list: HTMLElement, empty: HTMLElement, allBooks: ShelfBook[]): void {
    const t = (zh: string, en: string): string => this.text(zh, en);
    const language = this.plugin.getReaderSettings().interfaceLanguage;
    list.empty();
    const query = this.query.trim().toLocaleLowerCase("zh-CN");
    const selectableBooks = this.listOnly ? allBooks.filter((book) => book.inReadingList) : allBooks;
    const books = query
      ? selectableBooks.filter(({ file }) => `${file.basename}\n${file.path}`.toLocaleLowerCase("zh-CN").includes(query))
      : selectableBooks;
    empty.toggleClass("is-visible", books.length === 0);
    empty.setText(allBooks.length
      ? (this.listOnly ? t("书单中还没有 EPUB", "No EPUBs in your reading list yet") : t("没有匹配的 EPUB", "No matching EPUBs"))
      : t("Vault 中还没有 EPUB 文件", "There are no EPUB files in the Vault yet"));

    for (const book of books) {
      const button = list.createEl("button", {
        cls: "pavel-epub-bookshelf-book",
        attr: { type: "button", "aria-label": t(`打开 ${book.file.basename}`, `Open ${book.file.basename}`) },
      });
      const cover = button.createDiv({ cls: "pavel-epub-bookshelf-cover" });
      const coverIcon = cover.createSpan();
      setIcon(coverIcon, book.completed ? "badge-check" : "book-open");
      void this.attachCover(book.file, cover, coverIcon);
      const body = button.createDiv({ cls: "pavel-epub-bookshelf-book-body" });
      body.createDiv({ cls: "pavel-epub-bookshelf-book-title", text: book.file.basename });
      body.createDiv({ cls: "pavel-epub-bookshelf-book-path", text: book.file.parent?.path || t("Vault 根目录", "Vault root") });
      const meta = body.createDiv({ cls: "pavel-epub-bookshelf-book-meta" });
      meta.createSpan({ text: book.completed ? t("已读完", "Finished") : relativeTime(book.lastOpenedAt, language) });
      if (book.highlightCount) meta.createSpan({ text: t(`${book.highlightCount} 条标注`, `${book.highlightCount} annotations`) });
      if (book.bookmarkCount) meta.createSpan({ text: t(`${book.bookmarkCount} 个书签`, `${book.bookmarkCount} bookmarks`) });
      if (book.inReadingList) meta.createSpan({ text: t("书单", "Reading list") });
      const progress = body.createDiv({ cls: "pavel-epub-bookshelf-progress" });
      progress.createDiv({ cls: "pavel-epub-bookshelf-progress-track" })
        .createDiv({ cls: "pavel-epub-bookshelf-progress-value" })
        .setCssStyles({ width: percent(book.progress) });
      progress.createSpan({ text: percent(book.progress) });
      let touchStartY: number | null = null;
      let didScroll = false;
      button.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch") return;
        touchStartY = event.clientY;
        didScroll = false;
      });
      button.addEventListener("pointermove", (event) => {
        if (touchStartY === null || event.pointerType !== "touch") return;
        if (Math.abs(event.clientY - touchStartY) > 8) didScroll = true;
      });
      button.addEventListener("pointercancel", () => { touchStartY = null; });
      button.addEventListener("click", (event) => {
        touchStartY = null;
        if (didScroll) {
          event.preventDefault();
          didScroll = false;
          return;
        }
        void this.plugin.openEpub(book.file);
      });
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.openBookMenu(event, book);
      });
    }
  }

  private coverSignature(file: TFile): string {
    const coverPath = this.plugin.store.getBook(file.path)?.customCoverPath;
    const customCover = coverPath ? this.app.vault.getAbstractFileByPath(coverPath) : null;
    return `${fileSignature(file)}:${customCover instanceof TFile ? fileSignature(customCover) : coverPath ?? ""}`;
  }

  private async attachCover(file: TFile, cover: HTMLElement, fallbackIcon: HTMLElement): Promise<void> {
    const url = await this.getCoverUrl(file);
    if (!url || this.closed || !cover.isConnected) return;
    const image = cover.createEl("img", {
      attr: { src: url, alt: this.text(`${file.basename} 封面`, `${file.basename} cover`), loading: "lazy", decoding: "async" },
    });
    image.addEventListener("load", () => {
      if (!image.isConnected) return;
      fallbackIcon.remove();
      cover.addClass("has-image");
    }, { once: true });
    image.addEventListener("error", () => {
      image.remove();
      cover.removeClass("has-image");
    }, { once: true });
  }

  private getCoverUrl(file: TFile): Promise<string | null> {
    const signature = this.coverSignature(file);
    const cached = this.coverCache.get(file.path);
    if (cached?.signature === signature) return Promise.resolve(cached.url);
    if (cached?.url) URL.revokeObjectURL(cached.url);
    this.coverCache.delete(file.path);

    const loadKey = `${file.path}:${signature}`;
    const existing = this.coverLoads.get(loadKey);
    if (existing) return existing;
    const generation = this.coverGeneration;
    const promise = this.enqueueCover(async () => {
      if (this.closed || generation !== this.coverGeneration) return null;
      try {
        const customCoverPath = this.plugin.store.getBook(file.path)?.customCoverPath;
        const customCover = customCoverPath ? this.app.vault.getAbstractFileByPath(customCoverPath) : null;
        if (customCover instanceof TFile && IMAGE_EXTENSIONS.has(customCover.extension.toLowerCase())) {
          const binary = await this.app.vault.readBinary(customCover);
          if (this.closed || generation !== this.coverGeneration) return null;
          const url = URL.createObjectURL(new Blob([binary], { type: imageMimeType(customCover) }));
          this.coverCache.set(file.path, { signature, url });
          return url;
        }
        const binary = await this.app.vault.readBinary(file);
        const source = new File([binary], file.name, {
          type: "application/epub+zip",
          lastModified: file.stat.mtime,
        });
        const blob = await extractEpubCover(source);
        if (this.closed || generation !== this.coverGeneration) return null;
        const current = this.app.vault.getAbstractFileByPath(file.path);
        if (!(current instanceof TFile) || this.coverSignature(current) !== signature) return null;
        const url = blob ? URL.createObjectURL(blob) : null;
        this.coverCache.set(file.path, { signature, url });
        return url;
      } catch (error) {
        console.warn(`[OmniReader] Could not load cover: ${file.path}`, error);
        if (!this.closed && generation === this.coverGeneration) {
          this.coverCache.set(file.path, { signature, url: null });
        }
        return null;
      }
    });
    this.coverLoads.set(loadKey, promise);
    void promise.finally(() => this.coverLoads.delete(loadKey));
    return promise;
  }

  private enqueueCover<T>(task: () => Promise<T>): Promise<T> {
    const result = this.coverQueue.then(task, task);
    this.coverQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private releaseRemovedCovers(paths: Set<string>): void {
    for (const [path, cached] of this.coverCache) {
      if (paths.has(path)) continue;
      if (cached.url) URL.revokeObjectURL(cached.url);
      this.coverCache.delete(path);
    }
  }

  private openBookMenu(event: MouseEvent, book: ShelfBook): void {
    const t = (zh: string, en: string): string => this.text(zh, en);
    const language = this.plugin.getReaderSettings().interfaceLanguage;
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle(t("在新标签页打开", "Open in new tab"))
      .setIcon("external-link")
      .onClick(() => void this.plugin.openEpub(book.file)));
    menu.addItem((item) => item
      .setTitle(t("查看书籍完整信息", "View book details"))
      .setIcon("info")
      .onClick(() => new BookDetailsModal(book, this.app, language).open()));
    menu.addItem((item) => item
      .setTitle(t("重命名", "Rename"))
      .setIcon("pencil")
      .onClick(() => new RenameBookModal(this.app, book.file, language, (name) => this.renameBook(book.file, name)).open()));
    menu.addItem((item) => item
      .setTitle(book.completed ? t("标记为未读完", "Mark as unfinished") : t("标记为已读完", "Mark as finished"))
      .setIcon("badge-check")
      .onClick(() => this.setCompleted(book.file, !book.completed)));
    menu.addItem((item) => item
      .setTitle(t("自定义书籍封面", "Choose custom book cover"))
      .setIcon("image")
      .onClick(() => new ImagePickerModal(this.app, language, (cover) => this.setCustomCover(book.file, cover)).open()));
    if (this.plugin.store.getBook(book.file.path)?.customCoverPath) {
      menu.addItem((item) => item
        .setTitle(t("恢复 EPUB 原封面", "Restore EPUB cover"))
        .setIcon("undo-2")
        .onClick(() => this.clearCustomCover(book.file)));
    }
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle(book.inReadingList ? t("从书单中移除", "Remove from reading list") : t("加入书单", "Add to reading list"))
      .setIcon("list-plus")
      .onClick(() => this.setReadingList(book.file, !book.inReadingList)));
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle(t("从书架中移除", "Remove from bookshelf"))
      .setIcon("library-big")
      .onClick(() => this.hideFromBookshelf(book.file)));
    menu.addItem((item) => item
      .setTitle(t("删除书籍文件", "Delete book file"))
      .setIcon("trash-2")
      .setWarning(true)
      .onClick(() => new DeleteBookModal(this.app, book.file, language, () => this.deleteBook(book.file)).open()));
    menu.showAtMouseEvent(event);
  }

  private stateFor(file: TFile) {
    return this.plugin.store.ensureBook(file.path, { size: file.stat.size, mtime: file.stat.mtime });
  }

  private setCompleted(file: TFile, completed: boolean): void {
    const state = this.stateFor(file);
    state.readingStats ??= { totalReadingMs: 0, lastOpenedAt: 0, lastReadAt: 0, furthestFraction: 0 };
    state.readingStats.completedAt = completed ? Date.now() : undefined;
    if (completed) state.readingStats.furthestFraction = 1;
    this.plugin.store.markChanged(0);
    new Notice(completed ? this.text("已标记为读完", "Marked as finished") : this.text("已标记为未读完", "Marked as unfinished"));
    this.render();
  }

  private setReadingList(file: TFile, inReadingList: boolean): void {
    const state = this.stateFor(file);
    state.inReadingList = inReadingList || undefined;
    this.plugin.store.markChanged(0);
    new Notice(inReadingList ? this.text("已加入书单", "Added to reading list") : this.text("已从书单移除", "Removed from reading list"));
    this.render();
  }

  private setCustomCover(file: TFile, cover: TFile): void {
    const state = this.stateFor(file);
    state.customCoverPath = cover.path;
    this.plugin.store.markChanged(0);
    this.invalidateCover(file.path);
    new Notice(this.text("已更新书籍封面", "Book cover updated"));
    this.render();
  }

  private clearCustomCover(file: TFile): void {
    const state = this.stateFor(file);
    state.customCoverPath = undefined;
    this.plugin.store.markChanged(0);
    this.invalidateCover(file.path);
    this.render();
  }

  private hideFromBookshelf(file: TFile): void {
    const state = this.stateFor(file);
    state.hiddenFromBookshelf = true;
    this.plugin.store.markChanged(0);
    new Notice(this.text("已从 OmniReader 书架中移除；文件仍保留在 Vault 中。", "Removed from the OmniReader bookshelf. The file remains in the Vault."));
    this.render();
  }

  private async renameBook(file: TFile, rawName: string): Promise<void> {
    const base = rawName.replace(/[\\/:*?"<>|]/g, "").replace(/\.epub$/i, "").trim();
    if (!base) throw new Error(this.text("书名无效", "Invalid book name"));
    const nextPath = normalizePath(`${file.parent?.path ? `${file.parent.path}/` : ""}${base}.epub`);
    if (nextPath === file.path) return;
    if (this.app.vault.getAbstractFileByPath(nextPath)) throw new Error(this.text("同名文件已存在", "A file with that name already exists"));
    await this.app.vault.rename(file, nextPath);
    new Notice(this.text("书籍已重命名", "Book renamed"));
  }

  private async deleteBook(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.trashFile(file);
      this.plugin.store.removeBook(file.path);
      new Notice(this.text("书籍文件已移入系统回收站", "Book file moved to the system trash"));
    } catch (error) {
      console.error("[OmniReader] Could not delete EPUB", error);
      new Notice(this.text("删除书籍文件失败", "Could not delete the book file"));
    }
  }

  private invalidateCover(path: string): void {
    const cached = this.coverCache.get(path);
    if (cached?.url) URL.revokeObjectURL(cached.url);
    this.coverCache.delete(path);
  }

  private text(zh: string, en: string): string {
    return uiText(this.plugin.getReaderSettings().interfaceLanguage, zh, en);
  }
}
