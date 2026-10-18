import { normalizePath } from "obsidian";
import type { FileManager, TAbstractFile, TFile, Vault } from "obsidian";
import { createDefaultData, normalizeSettings } from "./defaults";
import { extensionForBlob, ensureVaultFolder, safeFileName, saveBlobToVault } from "./media-utils";
import { normalizeBookState, type DataAdapter } from "./store";
import type { BookState, ReaderData, ReaderSettings } from "./types";
import { createId } from "./utils";

interface BookDocument {
  version: 1;
  bookId: string;
  epub: string;
  digest: string;
  state: BookState;
}

interface ManagedBook {
  folder: TAbstractFile;
  file: TFile;
  document: BookDocument;
  raw: string;
}

function isFile(file: TAbstractFile | null): file is TFile {
  return Boolean(file && "extension" in file);
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function relative(value: string): string {
  if (!value || /[\\:*?"<>|]/.test(value) || value.startsWith("/")
    || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("无效的书库相对路径 / Invalid library relative path");
  }
  return value;
}

function within(path: string, root: string): boolean {
  return path.startsWith(`${root}/`);
}

function json(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }

/** Vault-backed storage. All mutations (including exports) share one queue. */
export class ManagedLibrary implements DataAdapter {
  root = "My Reader";
  settings: ReaderSettings = createDefaultData().settings;
  readonly problems: string[] = [];
  private records: ManagedBook[] = [];
  private chain: Promise<void> = Promise.resolve();
  private settingsRaw: string | null = null;
  private settingsBlocked = false;
  private ready = false;

  constructor(
    private readonly vault: Vault,
    private readonly files: Pick<FileManager, "renameFile" | "trashFile">,
    private readonly bootstrap: DataAdapter,
  ) {}

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.chain.then(operation, operation);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  message(zh: string, en: string): string {
    return this.settings.interfaceLanguage === "en" ? en : zh;
  }

  private fail(zh: string, en: string): never { throw new Error(this.message(zh, en)); }

  private requireReady(): void {
    if (!this.ready) this.fail("书库未成功加载，暂停写入以保护原文件", "Library did not load; writes stopped to preserve original files");
  }

  private rootPath(value: string): string {
    const path = relative(value.trim().replace(/\\/g, "/").replace(/\/+$/, ""));
    if (path.split("/").some((part) => part.startsWith(".")) || path === this.vault.configDir || within(path, this.vault.configDir)) {
      this.fail("书库须位于可见 Vault 目录", "The library must be in a visible Vault folder");
    }
    return normalizePath(path);
  }

  async loadData(): Promise<ReaderData> {
    const location = await this.bootstrap.loadData();
    if (location !== null && location !== undefined) {
      if (!object(location) || location.version !== 1 || typeof location.root !== "string") {
        this.fail("书库位置文件损坏，已停止写入", "Invalid library location; writes stopped");
      }
      this.root = this.rootPath(location.root);
      if (typeof location.pendingRoot === "string") {
        const pending = this.rootPath(location.pendingRoot);
        // Recover an interrupted rename before creating any missing source root.
        if (!this.vault.getAbstractFileByPath(this.root) && this.vault.getAbstractFileByPath(pending)) this.root = pending;
      }
    }
    await ensureVaultFolder(this.vault, this.root);
    const file = this.vault.getAbstractFileByPath(`${this.root}/settings.json`);
    if (file) {
      try {
        if (!isFile(file)) throw new Error("Not a file");
        this.settingsRaw = await this.vault.read(file);
        const value: unknown = JSON.parse(this.settingsRaw);
        if (!object(value) || value.version !== 1 || !object(value.settings)) throw new Error("Invalid settings");
        this.settings = normalizeSettings(value.settings);
      } catch {
        this.settingsBlocked = true;
        this.problems.push(this.message("全局设置损坏，保留原文且暂停设置写入", "Settings are invalid; original preserved and settings writes stopped"));
      }
    } else {
      this.settingsRaw = json({ version: 1, settings: this.settings });
      await this.vault.create(`${this.root}/settings.json`, this.settingsRaw);
    }
    await this.bootstrap.saveData({ version: 1, root: this.root });
    this.ready = true;
    return this.discover();
  }

  private documents(): TFile[] {
    return this.vault.getFiles().filter((file) => within(file.path, this.root) && file.name === "book.json");
  }

  async discover(): Promise<ReaderData> {
    this.problems.splice(this.settingsBlocked ? 1 : 0);
    const next: ManagedBook[] = [];
    for (const file of this.documents()) {
      try {
        const folder = file.parent;
        if (!folder) throw new Error("Missing parent");
        const raw = await this.vault.read(file);
        const value: unknown = JSON.parse(raw);
        if (!object(value) || value.version !== 1 || typeof value.bookId !== "string"
          || !/^[a-zA-Z0-9-]{16,80}$/.test(value.bookId) || typeof value.epub !== "string"
          || typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest)
          || !object(value.state) || !Array.isArray(value.state.bookmarks) || !Array.isArray(value.state.highlights)) {
          throw new Error("Invalid book state");
        }
        const epub = relative(value.epub);
        if (epub.includes("/")) throw new Error("EPUB must be a sibling");
        let source = this.vault.getAbstractFileByPath(`${folder.path}/${epub}`);
        if (!isFile(source) || source.extension.toLowerCase() !== "epub") {
          const siblings = folder.children.filter((child): child is TFile => isFile(child) && child.extension.toLowerCase() === "epub");
          if (siblings.length !== 1) throw new Error("Missing or ambiguous EPUB");
          source = siblings[0]!;
        }
        if (!isFile(source)) throw new Error("Missing EPUB");
        const state = normalizeBookState(value.state);
        state.bookId = value.bookId;
        // Only plugin-owned paths are resolved; no absolute references survive a copy.
        if (state.customCoverPath) state.customCoverPath = `${folder.path}/${relative(state.customCoverPath)}`;
        if (state.annotationDocuments) {
          state.annotationDocuments.highlightPath = `${folder.path}/${relative(state.annotationDocuments.highlightPath)}`;
          state.annotationDocuments.notePath = `${folder.path}/${relative(state.annotationDocuments.notePath)}`;
        }
        const previous = this.records.find((record) => record.folder.path === folder.path && record.document.bookId === value.bookId);
        if (previous && previous.raw !== raw) {
          // Validate references first, but never bless an external write as a stale reader's baseline.
          next.push(previous);
          this.problems.push(this.message(`书籍数据已外部修改，暂停覆盖并请重载插件：${file.path}`, `Book changed externally; writes stopped, reload the plugin: ${file.path}`));
          continue;
        }
        next.push({ folder, file: source, raw, document: {
          version: 1, bookId: value.bookId, epub: source.name, digest: value.digest, state,
        } });
      } catch {
        this.problems.push(this.message(`无法恢复书籍，原文件已保留：${file.path}`, `Cannot restore book; original preserved: ${file.path}`));
      }
    }
    this.records = next;
    const data = createDefaultData();
    data.settings = this.settings;
    for (const record of next) {
      if (next.filter((item) => item.document.bookId === record.document.bookId).length !== 1) {
        this.problems.push(this.message(`重复书籍身份，暂停写入：${record.folder.path}`, `Duplicate book identity; writes stopped: ${record.folder.path}`));
      } else data.books[record.file.path] = record.document.state;
    }
    return data;
  }

  get filesList(): TFile[] {
    return this.records.filter((r) => this.records.filter((v) => v.document.bookId === r.document.bookId).length === 1
      && isFile(this.vault.getAbstractFileByPath(r.file.path))
      && isFile(this.vault.getAbstractFileByPath(`${r.folder.path}/book.json`))).map((r) => r.file);
  }

  project(books: Record<string, BookState>): Record<string, BookState> {
    const next: Record<string, BookState> = {};
    for (const record of this.records) {
      if (!this.filesList.includes(record.file)) continue;
      const live = Object.values(books).find((state) => state.bookId === record.document.bookId);
      const state = structuredClone(live ?? record.document.state);
      if (state.customCoverPath) state.customCoverPath = `${record.folder.path}/${state.customCoverPath.split("/").pop()!}`;
      if (state.annotationDocuments) {
        state.annotationDocuments.highlightPath = `${record.folder.path}/高亮.md`;
        state.annotationDocuments.notePath = `${record.folder.path}/笔记.md`;
      }
      next[record.file.path] = state;
    }
    return next;
  }

  book(value: string): ManagedBook {
    const matches = this.records.filter((r) => r.file.path === value || r.document.bookId === value);
    if (matches.length !== 1 || this.records.filter((r) => r.document.bookId === matches[0]!.document.bookId).length !== 1) {
      this.fail("书籍未导入、已移除或存在身份冲突，请刷新书库", "Book is unmanaged, removed, or has an identity conflict; refresh the library");
    }
    return matches[0]!;
  }

  private async writable(record: ManagedBook): Promise<void> {
    if (!within(record.folder.path, this.root) || !this.vault.getAbstractFileByPath(record.file.path)) {
      this.fail("书籍已移出书库，暂停写入", "Book has left the library; writes stopped");
    }
    let count = 0;
    for (const file of this.documents()) {
      try {
        const value: unknown = JSON.parse(await this.vault.read(file));
        if (object(value) && value.bookId === record.document.bookId) count++;
      } catch { /* Invalid documents are preserved and reported by discovery. */ }
    }
    if (count !== 1) this.fail("重复或缺失的书籍身份，暂停写入", "Duplicate or missing book identity; writes stopped");
    const file = this.vault.getAbstractFileByPath(`${record.folder.path}/book.json`);
    if (!isFile(file) || await this.vault.read(file) !== record.raw) {
      this.fail("书籍数据已由外部修改，已暂停覆盖；检查文件后重载插件以读取外部版本", "Book data changed externally; writes stopped. Inspect the file and reload the plugin to load the external version");
    }
  }

  private relativeState(record: ManagedBook, state: BookState): BookState {
    const next = structuredClone(state);
    const local = (path: string): string => {
      if (!within(path, record.folder.path)) this.fail("资源不属于书籍文件夹", "Resource is outside the book folder");
      return relative(path.slice(record.folder.path.length + 1));
    };
    if (next.customCoverPath) next.customCoverPath = local(next.customCoverPath);
    if (next.annotationDocuments) {
      next.annotationDocuments.highlightPath = local(next.annotationDocuments.highlightPath);
      next.annotationDocuments.notePath = local(next.annotationDocuments.notePath);
    }
    return next;
  }

  private async replace(path: string, expected: string, content: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (!isFile(file)) this.fail("数据文件缺失，暂停写入", "Data file is missing; writes stopped");
    await this.vault.process(file, (current) => {
      if (current !== expected) this.fail("数据已被外部修改，原文件保留", "Data changed externally; original preserved");
      return content;
    });
  }

  saveData(value: unknown): Promise<void> {
    const data = value as ReaderData;
    return this.run(async () => {
      this.requireReady();
      this.settings = data.settings;
      const settings = json({ version: 1, settings: data.settings });
      if (settings !== this.settingsRaw) {
        if (this.settingsBlocked || this.settingsRaw === null) this.fail("全局设置不可写，原文件保留", "Settings are not writable; original preserved");
        await this.replace(`${this.root}/settings.json`, this.settingsRaw, settings);
        this.settingsRaw = settings;
      }
      const errors: unknown[] = [];
      for (const state of Object.values(data.books)) {
        const record = this.records.find((r) => r.document.bookId === state.bookId);
        if (!record) continue; // A queued pre-trash snapshot must never resurrect a book.
        try {
          const document = { ...record.document, epub: record.file.name, state: this.relativeState(record, state) };
          const content = json(document);
          if (content === record.raw) continue;
          await this.writable(record);
          await this.replace(`${record.folder.path}/book.json`, record.raw, content);
          record.raw = content;
          record.document = { ...document, state: structuredClone(state) };
        } catch (error) { errors.push(error); }
      }
      if (errors.length) throw errors[0];
    });
  }

  importBook(file: TFile): Promise<TFile> {
    return this.run(async () => {
      this.requireReady();
      const binary = await this.vault.readBinary(file);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", binary)), (v) => v.toString(16).padStart(2, "0")).join("");
      for (const record of this.records) {
        // Hash the current bytes: persisted digests are hints, never identity proof.
        const current = await this.vault.readBinary(record.file);
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", current)), (v) => v.toString(16).padStart(2, "0")).join("");
        if (hash === digest) { await this.writable(record); return record.file; }
      }
      if (file.extension.toLowerCase() !== "epub") this.fail("请选择 EPUB 文件", "Choose an EPUB file");
      const bookId = createId("book");
      const suffix = `-${bookId.slice(-8)}`;
      let prefix = "";
      for (const character of safeFileName(file.basename)) {
        if (new TextEncoder().encode(prefix + character + suffix).length >= 100) break;
        prefix += character;
      }
      const folder = `${this.root}/${prefix || "书"}${suffix}`;
      if (this.vault.getAbstractFileByPath(folder)) this.fail("书籍目录冲突，请重试", "Book folder collision; retry import");
      await this.vault.createFolder(folder);
      const original = file.path;
      let moved = false;
      try {
        await this.files.renameFile(file, `${folder}/${file.name}`);
        moved = true;
        const state = normalizeBookState({ bookId, sourceSignature: { size: file.stat.size, mtime: file.stat.mtime } });
        const document: BookDocument = { version: 1, bookId, epub: file.name, digest, state };
        await this.vault.create(`${folder}/book.json`, json(document));
      } catch (error) {
        if (moved) await this.files.renameFile(file, original);
        // Keep any failed-import directory for inspection; never delete user files.
        throw error;
      }
      await this.discover();
      return file;
    });
  }

  async withBook<T>(id: string, task: (folder: string, file: TFile, bookId: string) => Promise<T>): Promise<T> {
    return this.run(async () => {
      this.requireReady();
      const record = this.book(id);
      await this.writable(record);
      return task(record.folder.path, record.file, record.document.bookId);
    });
  }

  setCover(id: string, blob: Blob, custom: boolean): Promise<string> {
    return this.withBook(id, async (folder) => {
      const path = `${folder}/${custom ? "custom-cover" : "cover"}.${extensionForBlob(blob)}`;
      await saveBlobToVault(this.vault, path, blob);
      return path;
    });
  }

  trashBook(id: string): Promise<void> {
    return this.withBook(id, async () => {
      const record = this.book(id);
      await this.files.trashFile(record.folder);
      this.records = this.records.filter((r) => r !== record);
    });
  }

  relocate(target: string): Promise<void> {
    return this.run(async () => {
      this.requireReady();
      const next = this.rootPath(target);
      if (next === this.root) return;
      if (within(next.toLowerCase(), this.root.toLowerCase()) || within(this.root.toLowerCase(), next.toLowerCase())) {
        this.fail("新旧书库目录不能相互包含", "Library folders must not contain each other");
      }
      const destination = this.vault.getAbstractFileByPath(next);
      if (destination && (isFile(destination) || !("children" in destination) || !Array.isArray(destination.children) || destination.children.length)) {
        this.fail("目标目录已有内容，停止搬迁", "Destination is not empty; move stopped");
      }
      const old = this.root;
      const folder = this.vault.getAbstractFileByPath(old);
      if (!folder || isFile(folder)) this.fail("原书库不存在", "Original library is missing");
      await ensureVaultFolder(this.vault, next.split("/").slice(0, -1).join("/"));
      await this.bootstrap.saveData({ version: 1, root: old, pendingRoot: next });
      let moved = false;
      try {
        if (destination) await this.files.trashFile(destination);
        await this.files.renameFile(folder, next);
        moved = true;
        await this.bootstrap.saveData({ version: 1, root: next });
      }
      catch (error) {
        if (moved) {
          try { await this.files.renameFile(folder, old); }
          catch (rollbackError) {
            this.root = next;
            throw new Error(this.message(`回滚未完成，书库资料仍在 ${next}`, `Rollback incomplete; library data remains at ${next}`), { cause: rollbackError });
          }
        }
        // A failed cleanup leaves a recoverable pendingRoot journal, not a false empty library.
        try { await this.bootstrap.saveData({ version: 1, root: old }); } catch { /* Recover on next startup. */ }
        throw error;
      }
      this.root = next;
      // Keep live records, but rebuild every relative association at its new root.
      await this.discover();
    });
  }
}
