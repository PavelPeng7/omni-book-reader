import { App, Menu, Modal, Notice, Plugin, TFile, setIcon } from "obsidian";
import { AnnotationDocumentService, type AnnotationDocumentInput } from "./annotation-documents";
import { EPUB_BOOKSHELF_VIEW_TYPE, PavelEpubBookshelfView } from "./bookshelf-view";
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
    this.titleEl.setText("最近阅读");
    const books = Object.entries(this.store.snapshot.books)
      .filter(([, state]) => Boolean(state.readingStats?.lastOpenedAt))
      .sort(([, left], [, right]) => (right.readingStats?.lastOpenedAt ?? 0) - (left.readingStats?.lastOpenedAt ?? 0))
      .slice(0, 20);
    if (!books.length) {
      this.contentEl.createDiv({ cls: "pavel-epub-empty", text: "还没有阅读记录" });
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
        text: `${progressText(state.position?.fraction ?? state.readingStats?.furthestFraction ?? 0)} · ${new Date(state.readingStats!.lastOpenedAt).toLocaleString()}`,
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

  async onload(): Promise<void> {
    this.store = new ReaderDataStore(this, (error) => {
      console.error("[OmniReader] Failed to persist data", error);
    });
    await this.store.load();
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
      new Notice("OmniReader 无法接管 .epub：请停用其他 EPUB 阅读插件后重载 Obsidian");
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

    this.addCommand({
      id: "open-current-epub",
      name: "OmniReader：打开当前 EPUB",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const available = file instanceof TFile && file.extension.toLowerCase() === "epub";
        if (!checking && available) void this.openEpub(file);
        return available;
      },
    });

    this.addCommand({
      id: "open-epub-bookshelf",
      name: "OmniReader：打开书架",
      callback: () => void this.openBookshelf(),
    });
    this.addRibbonIcon("library", "打开 OmniReader 书架", () => void this.openBookshelf());

    this.addCommand({
      id: "open-recent-epub",
      name: "OmniReader：最近阅读与继续阅读",
      callback: () => new RecentReadingModal(this.app, this.store).open(),
    });

    this.addCommand({
      id: "toggle-reader-sidebar",
      name: "OmniReader：切换阅读侧栏",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking) view?.toggleSidebar();
        return Boolean(view);
      },
    });

    this.addCommand({
      id: "toggle-current-bookmark",
      name: "OmniReader：添加/移除当前位置书签",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking) view?.toggleBookmark();
        return Boolean(view);
      },
    });

    this.addCommand({
      id: "export-current-highlights",
      name: "OmniReader：导出当前 EPUB 高亮摘抄",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking && view) void view.exportAnnotations("highlights");
        return Boolean(view);
      },
    });

    this.addCommand({
      id: "export-current-notes",
      name: "OmniReader：导出当前 EPUB 笔记",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking && view) void view.exportAnnotations("notes");
        return Boolean(view);
      },
    });

    this.addCommand({
      id: "export-current-chapter",
      name: "OmniReader：导出当前 EPUB 章节为 Markdown",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking && view) void view.exportCurrentChapter();
        return Boolean(view);
      },
    });

    this.addCommand({
      id: "toggle-focus-paragraph",
      name: "OmniReader：切换沉浸式阅读",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking) view?.toggleFocusMode();
        return Boolean(view);
      },
    });

    this.addCommand({
      id: "show-reading-stats",
      name: "OmniReader：显示阅读统计",
      checkCallback: (checking) => {
        const view = this.getActiveReader();
        if (!checking) view?.openReadingStats();
        return Boolean(view);
      },
    });

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
        .setTitle(state?.hiddenFromBookshelf ? "OmniReader：加入书架" : "OmniReader：从书架中移除")
        .setIcon(state?.hiddenFromBookshelf ? "library-big" : "eye-off")
        .onClick(() => {
          const book = this.store.ensureBook(file.path, { size: file.stat.size, mtime: file.stat.mtime });
          book.hiddenFromBookshelf = state?.hiddenFromBookshelf ? undefined : true;
          this.store.markChanged(0);
          this.refreshBookshelves();
          new Notice(book.hiddenFromBookshelf ? "已从 OmniReader 书架中移除" : "已加入 OmniReader 书架");
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
    this.store.updateSettings(patch);
    for (const leaf of this.app.workspace.getLeavesOfType(EPUB_VIEW_TYPE)) {
      if (leaf.view instanceof PavelEpubReaderView) leaf.view.applySettings();
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
      new Notice(`CFI 链接属于其他 Vault：${vaultValue}`);
      return;
    }
    const path = normalizeVaultPath(pathValue ?? "");
    const cfi = String(cfiValue ?? "").trim();
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== "epub") {
      new Notice("CFI 链接中的 EPUB 文件不存在");
      return;
    }
    if (!isValidCfi(cfi)) {
      new Notice("CFI 链接中的阅读位置无效");
      return;
    }
    try {
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.openFile(file);
      if (leaf.view instanceof PavelEpubReaderView) await leaf.view.navigateToCfi(cfi);
      else new Notice("无法创建 EPUB 阅读视图");
    } catch (error) {
      console.error("[OmniReader] Failed to open CFI link", error);
      new Notice("打开 EPUB 原文位置失败");
    }
  }

  private getActiveReader(): PavelEpubReaderView | null {
    const view = this.app.workspace.getActiveViewOfType(PavelEpubReaderView);
    return view ?? null;
  }
}
