import { App, Menu, Modal, Notice, Plugin, TFile, setIcon, type Command } from "obsidian";
import { AnnotationDocumentService, type AnnotationDocumentInput } from "./annotation-documents";
import { EPUB_BOOKSHELF_VIEW_TYPE, PavelEpubBookshelfView } from "./bookshelf-view";
import { uiLocale, uiText } from "./i18n";
import { EPUB_VIEW_TYPE, PavelEpubReaderView } from "./reader-view";
import { PavelEpubSettingTab } from "./settings-ui";
import { ReaderDataStore } from "./store";
import type { ReaderSettings } from "./types";
import { isValidCfi, normalizeVaultPath } from "./utils";

function progressText(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

class RecentReadingModal extends Modal {
  constructor(app: App, private readonly store: ReaderDataStore) {
    super(app);
  }

  onOpen(): void {
    const language = this.store.settings.interfaceLanguage;
    const t = (zh: string, en: string): string => uiText(language, zh, en);
    this.titleEl.setText(t("最近阅读", "Recent reading"));
    const books = Object.entries(this.store.snapshot.books)
      .filter(([, state]) => Boolean(state.readingStats?.lastOpenedAt))
      .sort(([, left], [, right]) => (right.readingStats?.lastOpenedAt ?? 0) - (left.readingStats?.lastOpenedAt ?? 0))
      .slice(0, 20);
    if (!books.length) {
      this.contentEl.createDiv({ cls: "pavel-epub-empty", text: t("还没有阅读记录", "No reading history yet") });
      return;
    }
    const list = this.contentEl.createDiv({ cls: "pavel-epub-recent-list" });
    for (const [path, state] of books) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension.toLowerCase() !== "epub") continue;
      const button = list.createEl("button", { cls: "pavel-epub-recent-item", attr: { type: "button" } });
      const icon = button.createSpan({ cls: "pavel-epub-recent-icon" });
      setIcon(icon, "book-open");
      const text = button.createSpan({ cls: "pavel-epub-recent-text" });
      text.createSpan({ cls: "pavel-epub-recent-title", text: file.basename });
      text.createSpan({
        cls: "pavel-epub-recent-meta",
        text: `${progressText(state.position?.fraction ?? state.readingStats?.furthestFraction ?? 0)} · ${new Date(state.readingStats!.lastOpenedAt).toLocaleString(uiLocale(language))}`,
      });
      button.addEventListener("click", () => {
        void this.app.workspace.getLeaf(true).openFile(file);
        this.close();
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export default class PavelEpubReaderPlugin extends Plugin {
  store!: ReaderDataStore;
  private annotationDocuments!: AnnotationDocumentService;
  private commandLabels: Array<{ command: Command; zh: string; en: string }> = [];
  private bookshelfRibbonEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    this.store = new ReaderDataStore(this, (error) => {
      console.error("[OmniReader] Failed to persist data", error);
    });
    await this.store.load();
    const t = (zh: string, en: string): string => this.text(zh, en);
    this.annotationDocuments = new AnnotationDocumentService(this.app.vault);
    try {
      await this.annotationDocuments.migrateLegacyProtocolLinks(
        Object.values(this.store.snapshot.books).map((state) => state.annotationDocuments),
      );
    } catch (error) {
      console.error("[OmniReader] Could not migrate legacy CFI links", error);
    }

    this.registerView(EPUB_VIEW_TYPE, (leaf) => new PavelEpubReaderView(leaf, this));
    this.registerView(EPUB_BOOKSHELF_VIEW_TYPE, (leaf) => new PavelEpubBookshelfView(leaf, this));
    try {
      this.registerExtensions(["epub"], EPUB_VIEW_TYPE);
    } catch (error) {
      console.error("[OmniReader] Could not register .epub extension", error);
      new Notice(t("OmniReader 无法接管 .epub：请停用其他 EPUB 阅读插件后重载 Obsidian", "OmniReader could not register .epub files. Disable other EPUB reader plugins and reload Obsidian."));
    }

    this.registerObsidianProtocolHandler("pavel-epub-reader", (params) => {
      void this.openProtocolLocation(params.path, params.cfi, params.sourceVault ?? params.vault);
    });
    this.registerDomEvent(document, "click", (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      const href = anchor?.getAttribute("href") ?? "";
      if (!href.startsWith("obsidian://pavel-epub-reader?")) return;
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      void this.openProtocolLocation(
        url.searchParams.get("path") ?? undefined,
        url.searchParams.get("cfi") ?? undefined,
        url.searchParams.get("sourceVault") ?? url.searchParams.get("vault") ?? undefined,
      );
    }, { capture: true });

    this.addUiCommand({
      id: "open-current-epub",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available = file instanceof TFile && file.extension.toLowerCase() === "epub";
        if (!checking && available) void this.openEpub(file);
        return available;
      },
    }, "OmniReader：打开当前 EPUB", "OmniReader: Open current EPUB");

    this.addUiCommand({
      id: "open-epub-bookshelf",
      callback: () => void this.openBookshelf(),
    }, "OmniReader：打开书架", "OmniReader: Open bookshelf");
    this.bookshelfRibbonEl = this.addRibbonIcon("library", t("打开 OmniReader 书架", "Open OmniReader bookshelf"), () => void this.openBookshelf());

    this.addUiCommand({
      id: "open-recent-epub",
      callback: () => new RecentReadingModal(this.app, this.store).open(),
    }, "OmniReader：最近阅读与继续阅读", "OmniReader: Recent and continue reading");

    this.addUiCommand({
      id: "toggle-reader-sidebar",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking) view?.toggleSidebar();
        return Boolean(view);
      },
    }, "OmniReader：切换阅读侧栏", "OmniReader: Toggle reader sidebar");

    this.addUiCommand({
      id: "toggle-current-bookmark",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking) view?.toggleBookmark();
        return Boolean(view);
      },
    }, "OmniReader：添加/移除当前位置书签", "OmniReader: Add or remove bookmark here");

    this.addUiCommand({
      id: "export-current-highlights",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking && view) void view.exportAnnotations("highlights");
        return Boolean(view);
      },
    }, "OmniReader：导出当前 EPUB 高亮摘抄", "OmniReader: Export highlights from current EPUB");

    this.addUiCommand({
      id: "export-current-notes",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking && view) void view.exportAnnotations("notes");
        return Boolean(view);
      },
    }, "OmniReader：导出当前 EPUB 笔记", "OmniReader: Export notes from current EPUB");

    this.addUiCommand({
      id: "export-current-chapter",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking && view) void view.exportCurrentChapter();
        return Boolean(view);
      },
    }, "OmniReader：导出当前 EPUB 章节为 Markdown", "OmniReader: Export current EPUB chapter as Markdown");

    this.addUiCommand({
      id: "toggle-focus-paragraph",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking) view?.toggleFocusMode();
        return Boolean(view);
      },
    }, "OmniReader：切换沉浸式阅读", "OmniReader: Toggle immersive reading");

    this.addUiCommand({
      id: "show-reading-stats",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking) view?.openReadingStats();
        return Boolean(view);
      },
    }, "OmniReader：显示阅读统计", "OmniReader: Show reading statistics");

    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (file instanceof TFile && file.extension.toLowerCase() === "epub") {
        this.store.renameBook(oldPath, file.path);
      }
    }));

    this.registerEvent(this.app.workspace.on("file-menu", (menu: Menu, file) => {
      if (!(file instanceof TFile) || file.extension.toLowerCase() !== "epub") return;
      const state = this.store.getBook(file.path);
      menu.addSeparator();
      menu.addItem((item) => item
        .setTitle(state?.hiddenFromBookshelf
          ? this.text("OmniReader：加入书架", "OmniReader: Add to bookshelf")
          : this.text("OmniReader：从书架中移除", "OmniReader: Remove from bookshelf"))
        .setIcon(state?.hiddenFromBookshelf ? "library-big" : "eye-off")
        .onClick(() => {
          const book = this.store.ensureBook(file.path, { size: file.stat.size, mtime: file.stat.mtime });
          book.hiddenFromBookshelf = state?.hiddenFromBookshelf ? undefined : true;
          this.store.markChanged(0);
          this.refreshBookshelves();
          new Notice(book.hiddenFromBookshelf
            ? this.text("已从 OmniReader 书架中移除", "Removed from the OmniReader bookshelf")
            : this.text("已加入 OmniReader 书架", "Added to the OmniReader bookshelf"));
        }));
    }));

    this.addSettingTab(new PavelEpubSettingTab(this.app, this));
  }

  onunload(): void {
    void this.store?.flush();
    void this.annotationDocuments?.flush();
  }

  getReaderSettings(): ReaderSettings {
    return this.store.settings;
  }

  updateReaderSettings(patch: Partial<ReaderSettings>): void {
    const languageChanged = patch.interfaceLanguage !== undefined
      && patch.interfaceLanguage !== this.store.settings.interfaceLanguage;
    this.store.updateSettings(patch);
    if (languageChanged) {
      this.refreshBookshelves();
      this.refreshRegisteredLabels();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(EPUB_VIEW_TYPE)) {
      if (leaf.view instanceof PavelEpubReaderView) {
        if (languageChanged) leaf.view.refreshLanguage();
        else leaf.view.applySettings();
      }
    }
  }

  syncAnnotationDocuments(input: AnnotationDocumentInput): Promise<void> {
    return this.annotationDocuments.sync({
      ...input,
      exportTemplate: this.store.settings.exportTemplate,
      customExportTemplatePath: this.store.settings.customExportTemplatePath,
    });
  }

  async openEpub(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({
      type: EPUB_VIEW_TYPE,
      state: { file: file.path },
      active: true,
    });
  }

  private async openBookshelf(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(EPUB_BOOKSHELF_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeftLeaf(false) ?? this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: EPUB_BOOKSHELF_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  private refreshBookshelves(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(EPUB_BOOKSHELF_VIEW_TYPE)) {
      if (leaf.view instanceof PavelEpubBookshelfView) leaf.view.refresh();
    }
  }

  private async openProtocolLocation(pathValue: string | undefined, cfiValue: string | undefined, vaultValue: string | undefined): Promise<void> {
    if (vaultValue && vaultValue !== this.app.vault.getName()) {
      new Notice(this.text(`CFI 链接属于其他 Vault：${vaultValue}`, `This CFI link belongs to another Vault: ${vaultValue}`));
      return;
    }
    const path = normalizeVaultPath(pathValue ?? "");
    const cfi = String(cfiValue ?? "").trim();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "epub") {
      new Notice(this.text("CFI 链接中的 EPUB 文件不存在", "The EPUB in this CFI link does not exist"));
      return;
    }
    if (!isValidCfi(cfi)) {
      new Notice(this.text("CFI 链接中的阅读位置无效", "The reading position in this CFI link is invalid"));
      return;
    }
    try {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.openFile(file);
      if (leaf.view instanceof PavelEpubReaderView) await leaf.view.navigateToCfi(cfi);
      else new Notice(this.text("无法创建 EPUB 阅读视图", "Could not create the EPUB reader view"));
    } catch (error) {
      console.error("[OmniReader] Failed to open CFI link", error);
      new Notice(this.text("打开 EPUB 原文位置失败", "Could not open the EPUB source location"));
    }
  }

  private getActiveReader(): PavelEpubReaderView | null {
    const view = this.app.workspace.getActiveViewOfType(PavelEpubReaderView);
    return view ?? null;
  }

  private text(zh: string, en: string): string {
    return uiText(this.store.settings.interfaceLanguage, zh, en);
  }

  private addUiCommand(command: Omit<Command, "name">, zh: string, en: string): void {
    const registered = this.addCommand({ ...command, name: this.text(zh, en) });
    this.commandLabels.push({ command: registered, zh, en });
  }

  private refreshRegisteredLabels(): void {
    for (const entry of this.commandLabels) entry.command.name = this.text(entry.zh, entry.en);
    if (!this.bookshelfRibbonEl) return;
    const label = this.text("打开 OmniReader 书架", "Open OmniReader bookshelf");
    this.bookshelfRibbonEl.setAttribute("aria-label", label);
    this.bookshelfRibbonEl.setAttribute("title", label);
  }
}
