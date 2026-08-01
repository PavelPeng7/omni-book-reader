import { FuzzySuggestModal, ItemView, Menu, Modal, Notice, TFile, WorkspaceLeaf, normalizePath, setIcon } from "obsidian";
import { extractEpubCover } from "./epub-cover";
import type { ReaderDataStore } from "./store";

export const EPUB_BOOKSHELF_VIEW_TYPE = "pavel-epub-bookshelf-view";

export interface BookshelfHost {
  store: ReaderDataStore;
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
  constructor(app: import("obsidian").App, private readonly onChoose: (file: TFile) => void) {
    super(app);
    this.setPlaceholder("搜索 Vault 中的图片");
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
  constructor(private readonly book: ShelfBook, app: import("obsidian").App) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("书籍完整信息");
    const state = this.book;
    const details: Array<[string, string]> = [
      ["书名", state.file.basename],
      ["位置", state.file.path],
      ["文件大小", formatBytes(state.file.stat.size)],
      ["最近修改", new Date(state.file.stat.mtime).toLocaleString()],
      ["阅读进度", percent(state.progress)],
      ["阅读状态", state.completed ? "已读完" : "阅读中"],
      ["最近阅读", state.lastOpenedAt ? new Date(state.lastOpenedAt).toLocaleString() : "尚未阅读"],
      ["高亮", `${state.highlightCount} 条`],
      ["书签", `${state.bookmarkCount} 个`],
      ["书单", state.inReadingList ? "已加入" : "未加入"],
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
  constructor(app: import("obsidian").App, private readonly file: TFile, private readonly onSubmit: (name: string) => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("重命名书籍");
    const input = this.contentEl.createEl("input", {
      type: "text",
      value: this.file.basename,
      attr: { "aria-label": "新的书籍名称" },
    });
    const actions = this.contentEl.createDiv({ cls: "pavel-epub-modal-actions" });
    const save = actions.createEl("button", { cls: "mod-cta", text: "保存" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const submit = async () => {
      const value = input.value.trim();
      if (!value) return new Notice("请输入书籍名称");
      save.disabled = true;
      try {
        await this.onSubmit(value);
        this.close();
      } catch (error) {
        console.error("[OmniReader] Could not rename EPUB", error);
        new Notice(error instanceof Error ? error.message : "重命名书籍失败");
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
  constructor(app: import("obsidian").App, private readonly file: TFile, private readonly onConfirm: () => Promise<void>) { super(app); }

  onOpen(): void {
    this.titleEl.setText("删除书籍文件？");
    this.contentEl.createEl("p", { text: `“${this.file.basename}”将移入系统回收站。此操作不会删除其他笔记。` });
    const actions = this.contentEl.createDiv({ cls: "pavel-epub-modal-actions" });
    actions.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const remove = actions.createEl("button", { cls: "mod-warning", text: "移入回收站" });
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

function relativeTime(timestamp: number): string {
  if (!timestamp) return "尚未阅读";
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "刚刚阅读";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString();
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
    return "OmniReader 书架";
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
    const content = this.contentEl;
    content.empty();
    content.addClass("pavel-epub-bookshelf");

    const allBooks = this.getBooks();
    this.releaseRemovedCovers(new Set(allBooks.map((book) => book.file.path)));
    const heading = content.createDiv({ cls: "pavel-epub-bookshelf-heading" });
    const titleGroup = heading.createDiv();
    titleGroup.createDiv({ cls: "pavel-epub-bookshelf-kicker", text: "OMNIREADER" });
    titleGroup.createEl("h2", { text: "我的文库" });
    const count = heading.createDiv({ cls: "pavel-epub-bookshelf-count", text: String(allBooks.length) });
    count.setAttribute("aria-label", `${allBooks.length} 本 EPUB`);

    const summary = content.createDiv({ cls: "pavel-epub-bookshelf-summary" });
    const readingCount = allBooks.filter((book) => book.lastOpenedAt && !book.completed).length;
    const completedCount = allBooks.filter((book) => book.completed).length;
    summary.createSpan({ text: `${readingCount} 本在读` });
    summary.createSpan({ text: `${completedCount} 本读完` });

    const filters = content.createDiv({ cls: "pavel-epub-bookshelf-filters" });
    const allFilter = filters.createEl("button", { text: "全部书籍", attr: { type: "button", "aria-pressed": String(!this.listOnly) } });
    const listFilter = filters.createEl("button", { text: "我的书单", attr: { type: "button", "aria-pressed": String(this.listOnly) } });
    allFilter.toggleClass("is-active", !this.listOnly);
    listFilter.toggleClass("is-active", this.listOnly);
    allFilter.addEventListener("click", () => { this.listOnly = false; this.render(); });
    listFilter.addEventListener("click", () => { this.listOnly = true; this.render(); });

    const search = content.createDiv({ cls: "pavel-epub-bookshelf-search" });
    const searchIcon = search.createSpan();
    setIcon(searchIcon, "search");
    const input = search.createEl("input", {
      type: "search",
      attr: { placeholder: "搜索书名或路径", "aria-label": "搜索 OmniReader 书架" },
    });
    input.value = this.query;
    input.addEventListener("input", () => {
      this.query = input.value;
      this.renderBookList(list, empty, allBooks);
    });

    const section = content.createDiv({ cls: "pavel-epub-bookshelf-section" });
    section.createDiv({ cls: "pavel-epub-bookshelf-section-title", text: this.listOnly ? "我的书单" : "全部书籍" });
    const list = section.createDiv({ cls: "pavel-epub-bookshelf-list" });
    const empty = section.createDiv({ cls: "pavel-epub-bookshelf-empty" });
    this.renderBookList(list, empty, allBooks);
  }

  private renderBookList(list: HTMLElement, empty: HTMLElement, allBooks: ShelfBook[]): void {
    list.empty();
    const query = this.query.trim().toLocaleLowerCase("zh-CN");
    const selectableBooks = this.listOnly ? allBooks.filter((book) => book.inReadingList) : allBooks;
    const books = query
      ? selectableBooks.filter(({ file }) => `${file.basename}\n${file.path}`.toLocaleLowerCase("zh-CN").includes(query))
      : selectableBooks;
    empty.toggleClass("is-visible", books.length === 0);
    empty.setText(allBooks.length ? (this.listOnly ? "书单中还没有 EPUB" : "没有匹配的 EPUB") : "Vault 中还没有 EPUB 文件");

    for (const book of books) {
      const button = list.createEl("button", {
        cls: "pavel-epub-bookshelf-book",
        attr: { type: "button", "aria-label": `打开 ${book.file.basename}` },
      });
      const cover = button.createDiv({ cls: "pavel-epub-bookshelf-cover" });
      const coverIcon = cover.createSpan();
      setIcon(coverIcon, book.completed ? "badge-check" : "book-open");
      void this.attachCover(book.file, cover, coverIcon);
      const body = button.createDiv({ cls: "pavel-epub-bookshelf-book-body" });
      body.createDiv({ cls: "pavel-epub-bookshelf-book-title", text: book.file.basename });
      body.createDiv({ cls: "pavel-epub-bookshelf-book-path", text: book.file.parent?.path || "Vault 根目录" });
      const meta = body.createDiv({ cls: "pavel-epub-bookshelf-book-meta" });
      meta.createSpan({ text: book.completed ? "已读完" : relativeTime(book.lastOpenedAt) });
      if (book.highlightCount) meta.createSpan({ text: `${book.highlightCount} 条标注` });
      if (book.bookmarkCount) meta.createSpan({ text: `${book.bookmarkCount} 个书签` });
      if (book.inReadingList) meta.createSpan({ text: "书单" });
      const progress = body.createDiv({ cls: "pavel-epub-bookshelf-progress" });
      progress.createDiv({ cls: "pavel-epub-bookshelf-progress-track" })
        .createDiv({ cls: "pavel-epub-bookshelf-progress-value" })
        .style.setProperty("width", percent(book.progress));
      progress.createSpan({ text: percent(book.progress) });
      button.addEventListener("click", () => void this.plugin.openEpub(book.file));
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
      attr: { src: url, alt: `${file.basename} 封面`, loading: "lazy", decoding: "async" },
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
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle("在新标签页打开")
      .setIcon("external-link")
      .onClick(() => void this.plugin.openEpub(book.file)));
    menu.addItem((item) => item
      .setTitle("查看书籍完整信息")
      .setIcon("info")
      .onClick(() => new BookDetailsModal(book, this.app).open()));
    menu.addItem((item) => item
      .setTitle("重命名")
      .setIcon("pencil")
      .onClick(() => new RenameBookModal(this.app, book.file, (name) => this.renameBook(book.file, name)).open()));
    menu.addItem((item) => item
      .setTitle(book.completed ? "标记为未读完" : "标记为已读完")
      .setIcon("badge-check")
      .onClick(() => this.setCompleted(book.file, !book.completed)));
    menu.addItem((item) => item
      .setTitle("自定义书籍封面")
      .setIcon("image")
      .onClick(() => new ImagePickerModal(this.app, (cover) => this.setCustomCover(book.file, cover)).open()));
    if (this.plugin.store.getBook(book.file.path)?.customCoverPath) {
      menu.addItem((item) => item
        .setTitle("恢复 EPUB 原封面")
        .setIcon("undo-2")
        .onClick(() => this.clearCustomCover(book.file)));
    }
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle(book.inReadingList ? "从书单中移除" : "加入书单")
      .setIcon("list-plus")
      .onClick(() => this.setReadingList(book.file, !book.inReadingList)));
    menu.addSeparator();
    menu.addItem((item) => item
      .setTitle("从书架中移除")
      .setIcon("library-big")
      .onClick(() => this.hideFromBookshelf(book.file)));
    menu.addItem((item) => item
      .setTitle("删除书籍文件")
      .setIcon("trash-2")
      .setWarning(true)
      .onClick(() => new DeleteBookModal(this.app, book.file, () => this.deleteBook(book.file)).open()));
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
    new Notice(completed ? "已标记为读完" : "已标记为未读完");
    this.render();
  }

  private setReadingList(file: TFile, inReadingList: boolean): void {
    const state = this.stateFor(file);
    state.inReadingList = inReadingList || undefined;
    this.plugin.store.markChanged(0);
    new Notice(inReadingList ? "已加入书单" : "已从书单移除");
    this.render();
  }

  private setCustomCover(file: TFile, cover: TFile): void {
    const state = this.stateFor(file);
    state.customCoverPath = cover.path;
    this.plugin.store.markChanged(0);
    this.invalidateCover(file.path);
    new Notice("已更新书籍封面");
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
    new Notice("已从 OmniReader 书架中移除；文件仍保留在 Vault 中。");
    this.render();
  }

  private async renameBook(file: TFile, rawName: string): Promise<void> {
    const base = rawName.replace(/[\\/:*?"<>|]/g, "").replace(/\.epub$/i, "").trim();
    if (!base) throw new Error("书名无效");
    const nextPath = normalizePath(`${file.parent?.path ? `${file.parent.path}/` : ""}${base}.epub`);
    if (nextPath === file.path) return;
    if (this.app.vault.getAbstractFileByPath(nextPath)) throw new Error("同名文件已存在");
    await this.app.vault.rename(file, nextPath);
    new Notice("书籍已重命名");
  }

  private async deleteBook(file: TFile): Promise<void> {
    try {
      await this.app.vault.trash(file, true);
      this.plugin.store.removeBook(file.path);
      new Notice("书籍文件已移入系统回收站");
    } catch (error) {
      console.error("[OmniReader] Could not delete EPUB", error);
      new Notice("删除书籍文件失败");
    }
  }

  private invalidateCover(path: string): void {
    const cached = this.coverCache.get(path);
    if (cached?.url) URL.revokeObjectURL(cached.url);
    this.coverCache.delete(path);
  }
}
