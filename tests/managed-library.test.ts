import { webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileManager, TAbstractFile, TFile, Vault } from "obsidian";
import { ManagedLibrary } from "../src/managed-library";
import { ReaderDataStore, type DataAdapter } from "../src/store";
import { AnnotationDocumentService, buildCfiLink } from "../src/annotation-documents";
import { exportChapterMarkdown } from "../src/chapter-export";
import * as media from "../src/media-utils";

interface Entry {
  path: string; name: string; basename: string; extension?: string;
  parent: Entry | null; children: Entry[]; stat: { size: number; mtime: number };
  text: string; bytes: ArrayBuffer;
}

/** Models mutable Vault file handles, including descendant paths on folder rename. */
class MemoryVault {
  configDir = ".obsidian";
  entries = new Map<string, Entry>();
  trashed: string[] = [];
  failCreate = false;
  failMove = false;
  failTrash = false;

  getName() { return "Test Vault"; }
  getFiles() { return [...this.entries.values()].filter((entry) => entry.extension !== undefined); }
  getAbstractFileByPath(path: string) { return this.entries.get(path) ?? null; }
  async createFolder(path: string) { return this.add(path); }
  add(path: string, text?: string): Entry {
    if (this.entries.has(path)) throw new Error(`Exists: ${path}`);
    const parentPath = path.split("/").slice(0, -1).join("/");
    const parent = parentPath ? this.entries.get(parentPath) ?? this.add(parentPath) : null;
    const name = path.split("/").pop()!;
    const entry: Entry = {
      path, name, basename: text === undefined ? name : name.replace(/\.[^.]*$/, ""),
      ...(text === undefined ? {} : { extension: name.split(".").pop()! }),
      parent, children: [], stat: { size: text?.length ?? 0, mtime: 1 },
      text: text ?? "", bytes: new TextEncoder().encode(text ?? "").buffer,
    };
    parent?.children.push(entry);
    this.entries.set(path, entry);
    return entry;
  }
  async create(path: string, text: string) {
    if (this.failCreate && path.endsWith("book.json")) throw new Error("Create failed");
    return this.add(path, text);
  }
  async createBinary(path: string, bytes: ArrayBuffer) { const entry = this.add(path, "binary"); entry.bytes = bytes; return entry; }
  async modifyBinary(entry: Entry, bytes: ArrayBuffer) { entry.bytes = bytes; }
  async read(entry: Entry) { return entry.text; }
  async cachedRead(entry: Entry) { return entry.text; }
  async readBinary(entry: Entry) { return entry.bytes.slice(0); }
  async modify(entry: Entry, text: string) { entry.text = text; }
  async process(entry: Entry, callback: (text: string) => string) { entry.text = callback(entry.text); return entry.text; }
  async renameFile(entry: Entry, path: string) {
    if (this.failMove) throw new Error("Move failed");
    if (this.entries.has(path)) throw new Error("Destination exists");
    const original = entry.path;
    const moved = [...this.entries.values()].filter((item) => item === entry || item.path.startsWith(`${original}/`));
    if (entry.parent) entry.parent.children = entry.parent.children.filter((child) => child !== entry);
    for (const item of moved) this.entries.delete(item.path);
    for (const item of moved) {
      item.path = path + item.path.slice(original.length);
      item.name = item.path.split("/").pop()!;
      item.basename = item.extension === undefined ? item.name : item.name.replace(/\.[^.]*$/, "");
      this.entries.set(item.path, item);
    }
    entry.parent = this.entries.get(path.split("/").slice(0, -1).join("/")) ?? null;
    entry.parent?.children.push(entry);
  }
  async trashFile(entry: Entry) {
    if (this.failTrash) throw new Error("Trash failed");
    this.trashed.push(entry.path);
    if (entry.parent) entry.parent.children = entry.parent.children.filter((child) => child !== entry);
    for (const key of this.entries.keys()) if (key === entry.path || key.startsWith(`${entry.path}/`)) this.entries.delete(key);
  }
  copyFolder(source: string, target: string, vault = this) {
    for (const entry of [...this.entries.values()].sort((a, b) => a.path.length - b.path.length)) {
      if (entry.path !== source && !entry.path.startsWith(`${source}/`)) continue;
      const copy = vault.add(target + entry.path.slice(source.length), entry.extension === undefined ? undefined : entry.text);
      copy.bytes = entry.bytes.slice(0);
    }
  }
}

class Bootstrap implements DataAdapter {
  value: unknown = null;
  fail = false;
  saves = 0;
  failAt = 0;
  async loadData() { return this.value; }
  async saveData(value: unknown) { this.saves++; if (this.fail || this.saves === this.failAt) throw new Error("Location save failed"); this.value = value; }
}

async function setup(vault = new MemoryVault(), location = new Bootstrap()) {
  const library = new ManagedLibrary(vault as unknown as Vault, vault as unknown as FileManager, location);
  const onError = vi.fn();
  const store = new ReaderDataStore(library, onError);
  await store.load();
  const importBook = async (path: string, bytes = path) => {
    const file = vault.add(path, bytes);
    const result = await library.importBook(file as unknown as TFile);
    store.reconcile((await library.discover()).books);
    return result;
  };
  return { vault, library, store, location, importBook, onError };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", NodeBlob);
});

describe("managed library through public Vault operations", () => {
  it("moves imports, persists per-book state and settings, and reloads without old data", async () => {
    const vault = new MemoryVault();
    const legacy = vault.add("old/data.json", "{old progress}");
    const oldExport = vault.add("Books/old/高亮.md", "manual old content");
    const { library, store, location, importBook } = await setup(vault);
    const file = await importBook("Inbox/一本书.epub");
    expect(vault.getAbstractFileByPath("Inbox/一本书.epub")).toBeNull();
    expect(file.path).toMatch(/^My Reader\/一本书-[a-z0-9-]+\/一本书.epub$/);
    vault.add("Inbox/unmanaged.epub", "another");
    expect(library.filesList.map((item) => item.path)).toEqual([file.path]);
    const state = store.getBook(file.path)!;
    state.position = { cfi: "epubcfi(/6/2!/4/2:0)", fraction: 0.4, updatedAt: 10 };
    state.readingStats = { totalReadingMs: 5000, lastOpenedAt: 1, lastReadAt: 2, furthestFraction: 0.4 };
    state.bookmarks.push({ id: "b", cfi: state.position.cfi, fraction: 0.4, chapter: "Chapter", createdAt: 1 });
    store.updateSettings({ theme: "dark" });
    await store.flush();
    const restored = await setup(vault, location);
    expect(restored.store.getBook(file.path)).toMatchObject({ bookId: state.bookId, position: state.position, readingStats: state.readingStats, bookmarks: state.bookmarks });
    expect(restored.store.settings.theme).toBe("dark");
    expect(legacy.text).toBe("{old progress}");
    expect(oldExport.text).toBe("manual old content");
    expect(location.value).toEqual({ version: 1, root: "My Reader" });
  });

  it("reuses identical bytes without touching duplicate sources, while same names can coexist", async () => {
    const { library, store, vault, importBook } = await setup();
    const first = await importBook("A/book.epub", "same bytes");
    const id = store.getBook(first.path)!.bookId;
    const duplicate = vault.add("B/renamed.epub", "same bytes");
    expect(await library.importBook(duplicate as unknown as TFile)).toBe(first);
    expect(duplicate.path).toBe("B/renamed.epub");
    const second = await importBook("B/book.epub", "diff bytes");
    expect(store.getBook(second.path)!.bookId).not.toBe(id);
    expect(library.filesList).toHaveLength(2);
  });

  it("restores the original EPUB after initialization fails", async () => {
    const { library, vault } = await setup();
    const file = vault.add("Inbox/book.epub", "bytes");
    vault.failCreate = true;
    await expect(library.importBook(file as unknown as TFile)).rejects.toThrow("Create failed");
    expect(file.path).toBe("Inbox/book.epub");
    expect(vault.getAbstractFileByPath(file.path)).toBe(file);
    expect((await library.discover()).books).toEqual({});
  });

  it("preserves a source when moving fails and does not shorten the original EPUB name", async () => {
    const { library, vault } = await setup();
    const name = `${"长书名".repeat(50)}.epub`;
    const file = vault.add(`Inbox/${name}`, "bytes");
    vault.failMove = true;
    await expect(library.importBook(file as unknown as TFile)).rejects.toThrow("Move failed");
    expect(file.path).toBe(`Inbox/${name}`);
    vault.failMove = false;
    const imported = await library.importBook(file as unknown as TFile);
    expect(imported.name).toBe(name);
    expect(new TextEncoder().encode(imported.parent!.name).length).toBeLessThan(100);
  });

  it("blocks duplicate IDs before discovery and recovers once the duplicate is removed", async () => {
    const { library, vault, store, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const folder = file.parent!.path;
    vault.copyFolder(folder, "My Reader/duplicate");
    await expect(library.withBook(file.path, async () => "write")).rejects.toThrow("身份");
    const data = await library.discover();
    expect(data.books).toEqual({});
    expect(library.problems.join(" ")).toContain("重复");
    await vault.trashFile(vault.getAbstractFileByPath("My Reader/duplicate")!);
    store.reconcile((await library.discover()).books);
    await expect(library.withBook(file.path, async () => "safe")).resolves.toBe("safe");
  });

  it("does not overwrite externally modified or malformed state, while healthy books still save", async () => {
    const { library, vault, store, importBook, onError } = await setup();
    const first = await importBook("Inbox/first.epub");
    const second = await importBook("Inbox/second.epub");
    const broken = vault.getAbstractFileByPath(`${first.parent!.path}/book.json`)!;
    broken.text = "{broken";
    store.getBook(first.path)!.inReadingList = true;
    store.getBook(second.path)!.inReadingList = true;
    store.markChanged(10000);
    await expect(store.flush()).rejects.toThrow();
    expect(broken.text).toBe("{broken");
    expect(onError).toHaveBeenCalled();
    const healthy = JSON.parse(vault.getAbstractFileByPath(`${second.parent!.path}/book.json`)!.text);
    expect(healthy.state.inReadingList).toBe(true);
    const data = await library.discover();
    expect(Object.keys(data.books)).toEqual([second.path]);
    expect(library.problems.join(" ")).toContain("原文件");
  });

  it("rejects tampered state references that would escape a book folder", async () => {
    const { library, vault, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const metadata = vault.getAbstractFileByPath(`${file.parent!.path}/book.json`)!;
    const doc = JSON.parse(metadata.text);
    doc.epub = "../../Inbox/other.epub";
    metadata.text = JSON.stringify(doc);
    expect((await library.discover()).books).toEqual({});
    expect(metadata.text).toContain("../../");
  });

  it("keeps extracted and custom covers inside the book and leaves the original image intact", async () => {
    const { library, vault, store, importBook, location } = await setup();
    const file = await importBook("Inbox/book.epub");
    const original = vault.add("Images/original.png", "image bytes");
    const path = await library.setCover(file.path, new Blob([original.bytes], { type: "image/png" }), true);
    await library.setCover(file.path, new Blob(["cover"], { type: "image/jpeg" }), false);
    store.getBook(file.path)!.customCoverPath = path;
    store.markChanged(10000);
    await store.flush();
    const saved = JSON.parse(vault.getAbstractFileByPath(`${file.parent!.path}/book.json`)!.text);
    expect(saved.state.customCoverPath).toBe("custom-cover.png");
    expect(vault.getAbstractFileByPath(`${file.parent!.path}/cover.jpg`)).not.toBeNull();
    expect(original.path).toBe("Images/original.png");
    const reload = await setup(vault, location);
    expect(reload.store.getBook(file.path)!.customCoverPath).toBe(path);
  });

  it("exports annotations into the book, preserves manual text, and generates ID links", async () => {
    const { library, vault, store, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const state = store.getBook(file.path)!;
    state.highlights.push({ id: "h", cfi: "epubcfi(/6/2!/4/2:0)", text: "quoted", chapter: "one", color: "yellow", style: "highlight", tags: [], sectionIndex: 0, createdAt: 1 });
    const service = new AnnotationDocumentService(vault as unknown as Vault, vault as unknown as FileManager);
    const sync = () => library.withBook(state.bookId!, (folder, sourceFile, bookId) => service.sync({ sourceFile, state, title: "Book", author: "", outputFolder: folder, bookId }));
    await sync();
    const highlight = vault.getAbstractFileByPath(`${file.parent!.path}/高亮.md`)!;
    highlight.text += "\nHandwritten summary\n";
    state.highlights[0]!.text = "new quote";
    await sync();
    expect(highlight.text).toContain("Handwritten summary");
    expect(highlight.text).toContain("new quote");
    expect(highlight.text).toContain(`bookId=${state.bookId}`);
    expect(highlight.text).not.toContain("?path=");
    store.markChanged(10000);
    await store.flush();
    expect(JSON.parse(vault.getAbstractFileByPath(`${file.parent!.path}/book.json`)!.text).state.annotationDocuments.highlightPath).toBe("高亮.md");
    highlight.text = "<!-- omni-book-reader:highlights:start -->\nbroken";
    await expect(sync()).rejects.toThrow();
    expect(highlight.text).toContain("broken");
  });

  it("exports chapters within the managed book and keeps manual text on refresh", async () => {
    const { library, vault, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = "<p>Chapter text</p>";
    const exportChapter = () => library.withBook(file.path, (folder, sourceFile, bookId) => exportChapterMarkdown({ vault: vault as unknown as Vault, sourceFile, bookId, outputFolder: `${folder}/章节导出`, document: doc, sectionIndex: 0, chapter: "Chapter one", bookTitle: "Book", author: "", vaultName: "Test", highlights: [] }));
    const path = await exportChapter();
    expect(path).toBe(`${file.parent!.path}/章节导出/Chapter one.md`);
    vault.getAbstractFileByPath(path)!.text += "\nManual chapter note";
    doc.body.innerHTML = "<p>Updated</p>";
    await exportChapter();
    expect(vault.getAbstractFileByPath(path)!.text).toContain("Manual chapter note");
  });

  it("retains live reader state through file and folder renames, then reloads at the new location", async () => {
    const { library, vault, store, importBook, location } = await setup();
    const file = await importBook("Inbox/book.epub");
    const state = store.getBook(file.path)!;
    state.annotationDocuments = { highlightPath: `${file.parent!.path}/高亮.md`, notePath: `${file.parent!.path}/笔记.md`, createdDate: "2026-10-18" };
    store.markChanged(10000);
    await store.flush();
    const id = state.bookId!;
    await vault.renameFile(file as unknown as Entry, `${file.parent!.path}/renamed.epub`);
    await vault.renameFile(file.parent as unknown as Entry, "My Reader/moved book");
    store.reconcile(library.project(store.snapshot.books));
    expect(store.getBook(file.path)).toBe(state);
    expect(state.annotationDocuments!.highlightPath).toBe("My Reader/moved book/高亮.md");
    state.inReadingList = true;
    store.markChanged(10000);
    await store.flush();
    const reload = await setup(vault, location);
    expect(reload.library.book(id).file.path).toBe("My Reader/moved book/renamed.epub");
    expect(reload.store.getBook(file.path)!.inReadingList).toBe(true);
    expect(buildCfiLink("Vault", file.path, "epubcfi(/6/2)", id)).toContain(`bookId=${id}`);
  });

  it("copies a complete book to another Vault without depending on the source index", async () => {
    const first = await setup();
    const file = await first.importBook("Inbox/book.epub");
    const state = first.store.getBook(file.path)!;
    state.position = { cfi: "epubcfi(/6/2)", fraction: 0.6, updatedAt: 1 };
    state.customCoverPath = await first.library.setCover(file.path, new Blob(["image"], { type: "image/png" }), true);
    first.store.markChanged(10000);
    await first.store.flush();
    first.vault.add(`${file.parent!.path}/章节导出/assets/image.png`, "image");
    const target = new MemoryVault();
    first.vault.copyFolder(file.parent!.path, "My Reader/Portable Book", target);
    const second = await setup(target);
    const restored = second.library.book(state.bookId!);
    expect(second.store.getBook(restored.file.path)!.position).toEqual(state.position);
    expect(second.store.getBook(restored.file.path)!.customCoverPath).toBe("My Reader/Portable Book/custom-cover.png");
    expect(target.getAbstractFileByPath("My Reader/Portable Book/章节导出/assets/image.png")).not.toBeNull();
  });

  it("recycles the complete folder and never resurrects it from a queued stale snapshot", async () => {
    const { library, vault, store, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const folder = file.parent!.path;
    vault.add(`${folder}/My handwritten notes.md`, "manual");
    vault.add(`${folder}/章节导出/assets/image.png`, "image");
    const snapshot = store.snapshot;
    await library.trashBook(file.path);
    await library.saveData(snapshot);
    expect(vault.trashed).toContain(folder);
    expect([...vault.entries.keys()].some((path) => path === folder || path.startsWith(`${folder}/`))).toBe(false);
    expect(library.filesList).toEqual([]);
  });

  it("keeps files and state associations when trashing fails", async () => {
    const { library, vault, store, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    vault.failTrash = true;
    await expect(library.trashBook(file.path)).rejects.toThrow("Trash failed");
    expect(library.book(file.path).file).toBe(file);
    expect(store.getBook(file.path)).toBeDefined();
    expect(vault.getAbstractFileByPath(file.path)).toBe(file);
  });

  it("moves a multi-book library and settings, then restores them after restart", async () => {
    const { library, vault, store, location, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    await importBook("Inbox/second.epub");
    const id = store.getBook(file.path)!.bookId!;
    vault.add(`${file.parent!.path}/manual.md`, "manual");
    store.updateSettings({ theme: "dark" });
    await store.flush();
    await library.relocate("Reading/Library");
    store.reconcile(library.project(store.snapshot.books));
    expect(library.book(id).file.path).toMatch(/^Reading\/Library\//);
    expect(location.value).toEqual({ version: 1, root: "Reading/Library" });
    expect(vault.getAbstractFileByPath("My Reader")).toBeNull();
    const restored = await setup(vault, location);
    expect(restored.store.settings.theme).toBe("dark");
    expect(restored.library.filesList).toHaveLength(2);
    expect(vault.getAbstractFileByPath(`${restored.library.book(id).folder.path}/manual.md`)!.text).toBe("manual");
  });

  it("rejects unsafe/nonempty destinations and rolls back a failed location commit", async () => {
    const { library, vault, location, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const original = file.path;
    vault.add("Occupied/manual.md", "manual");
    for (const path of ["Occupied", "My Reader/inside", "../outside", ".obsidian/library", "C:/outside"]) {
      await expect(library.relocate(path)).rejects.toThrow();
      expect(library.root).toBe("My Reader");
      expect(file.path).toBe(original);
    }
    location.failAt = location.saves + 2;
    await expect(library.relocate("New library")).rejects.toThrow("Location save failed");
    expect(file.path).toBe(original);
    expect(location.value).toEqual({ version: 1, root: "My Reader" });
    expect(library.root).toBe("My Reader");
  });

  it("accepts an empty destination and serializes exports before relocation", async () => {
    const { library, vault, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const id = library.book(file.path).document.bookId;
    await vault.createFolder("Empty destination");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = library.withBook(id, async (folder) => { await gate; vault.add(`${folder}/export.md`, "export"); });
    const moving = library.relocate("Empty destination");
    release();
    await pending;
    await moving;
    expect(vault.getAbstractFileByPath(`${library.book(id).folder.path}/export.md`)!.text).toBe("export");
    expect(vault.getAbstractFileByPath("My Reader")).toBeNull();
  });

  it("preserves a malformed settings file and refuses to silently replace it", async () => {
    const vault = new MemoryVault();
    const file = vault.add("My Reader/settings.json", "{broken");
    const { store } = await setup(vault);
    store.updateSettings({ theme: "dark" });
    await expect(store.flush()).rejects.toThrow();
    expect(file.text).toBe("{broken");
  });

  it("recovers a rename interrupted before committing the new bootstrap root", async () => {
    const { library, vault, location, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const id = library.book(file.path).document.bookId;
    await location.saveData({ version: 1, root: "My Reader", pendingRoot: "Recovered library" });
    await vault.renameFile(vault.getAbstractFileByPath("My Reader")!, "Recovered library");
    const restored = await setup(vault, location);
    expect(restored.library.root).toBe("Recovered library");
    expect(restored.library.book(id).file).toBe(file);
    expect(vault.getAbstractFileByPath("My Reader")).toBeNull();
  });

  it("does not move sources when the bootstrap itself is malformed", async () => {
    const location = new Bootstrap();
    location.value = { invalid: true };
    const { library, vault } = await setup(new MemoryVault(), location);
    const file = vault.add("Inbox/book.epub", "source");
    await expect(library.importBook(file as unknown as TFile)).rejects.toThrow();
    expect(file.path).toBe("Inbox/book.epub");
    expect(location.value).toEqual({ invalid: true });
  });

  it("copies inline chapter images using relative assets links that survive a folder move", async () => {
    const { library, vault, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    vi.spyOn(media, "sourceToBlob").mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<section><p>Text <img src="data:image/png;base64,AA==" alt="Example"></p></section>';
    const output = await library.withBook(file.path, (folder, sourceFile, bookId) => exportChapterMarkdown({ vault: vault as unknown as Vault, sourceFile, bookId, outputFolder: `${folder}/章节导出`, document: doc, sectionIndex: 0, chapter: "Chapter", bookTitle: "Book", author: "", vaultName: "Test", highlights: [] }));
    expect(vault.getAbstractFileByPath(output)!.text).toContain("![Example](assets/Chapter-1.png)");
    expect(vault.getAbstractFileByPath(`${file.parent!.path}/章节导出/assets/Chapter-1.png`)).not.toBeNull();
    expect(media.sourceToBlob).toHaveBeenCalledTimes(1);
    await vault.renameFile(file.parent as unknown as Entry, "My Reader/Renamed");
    expect(vault.getAbstractFileByPath("My Reader/Renamed/章节导出/Chapter.md")!.text).toContain("assets/Chapter-1.png");
  });

  it("preserves edits made during discovery and never accepts external text as a stale reader's write baseline", async () => {
    const { library, vault, store, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const live = store.getBook(file.path)!;
    live.inReadingList = true;
    await library.discover();
    store.reconcile(library.project(store.snapshot.books));
    expect(store.getBook(file.path)).toBe(live);
    expect(live.inReadingList).toBe(true);
    const metadata = vault.getAbstractFileByPath(`${file.parent!.path}/book.json`)!;
    const external = JSON.parse(metadata.text);
    external.state.title = "External title";
    metadata.text = JSON.stringify(external);
    const original = metadata.text;
    await library.discover();
    store.reconcile(library.project(store.snapshot.books));
    store.markChanged(10000);
    await expect(store.flush()).rejects.toThrow();
    expect(metadata.text).toBe(original);
    expect(library.problems.join(" ")).toContain("外部修改");
  });

  it("removes manually deleted books from discovery without recreating their files", async () => {
    const { library, vault, store, importBook } = await setup();
    const file = await importBook("Inbox/book.epub");
    const folder = file.parent!.path;
    await vault.trashFile(file.parent as unknown as Entry);
    store.reconcile(library.project(store.snapshot.books));
    store.markChanged(10000);
    await store.flush();
    expect(library.filesList).toEqual([]);
    expect(vault.getAbstractFileByPath(folder)).toBeNull();
  });
});
