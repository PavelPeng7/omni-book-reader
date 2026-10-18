import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("obsidian")>(),
  ItemView: class {
    app: unknown;
    containerEl = document.createElement("div");
    contentEl = document.createElement("div");
    constructor(leaf: { app: unknown }) { this.app = leaf.app; this.containerEl.append(this.contentEl); document.body.append(this.containerEl); }
    registerEvent() {}
  },
  TFile: class {}, FuzzySuggestModal: class {}, Modal: class {}, Menu: class {},
  setIcon: () => {}, Notice: class {},
}));
vi.mock("../src/epub-cover", () => ({ extractEpubCover: vi.fn() }));

import { TFile, type WorkspaceLeaf } from "obsidian";
import { createDefaultData } from "../src/defaults";
import { OmniBookReaderBookshelfView, type BookshelfHost } from "../src/bookshelf-view";

class Events {
  handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  on(name: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(name, [...this.handlers.get(name) ?? [], handler]);
    return { name, handler };
  }
  emit(name: string, ...args: unknown[]) { for (const handler of this.handlers.get(name) ?? []) handler(...args); }
}

const originals = new Map<string, PropertyDescriptor | undefined>();
function install(name: string, value: unknown) {
  originals.set(name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name));
  Object.defineProperty(HTMLElement.prototype, name, { value, configurable: true });
}

function makeElement(this: HTMLElement, tag: string, options: Record<string, unknown> = {}) {
  const element = document.createElement(tag);
  if (options.cls) element.className = String(options.cls);
  if (options.text !== undefined) element.textContent = String(options.text);
  for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, String(value));
  for (const key of ["type", "value"]) if (options[key] !== undefined) element.setAttribute(key, String(options[key]));
  this.append(element);
  return element;
}

beforeEach(() => {
  install("createEl", makeElement);
  install("createDiv", function(this: HTMLElement, options?: Record<string, unknown>) { return makeElement.call(this, "div", options); });
  install("createSpan", function(this: HTMLElement, options?: Record<string, unknown>) { return makeElement.call(this, "span", options); });
  install("empty", function(this: HTMLElement) { this.replaceChildren(); });
  install("addClass", function(this: HTMLElement, name: string) { this.classList.add(name); });
  install("removeClass", function(this: HTMLElement, name: string) { this.classList.remove(name); });
  install("toggleClass", function(this: HTMLElement, name: string, on: boolean) { this.classList.toggle(name, on); });
  install("setText", function(this: HTMLElement, text: string) { this.textContent = text; });
  install("setCssStyles", function(this: HTMLElement, styles: Record<string, string>) { Object.assign(this.style, styles); });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  document.body.replaceChildren();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, name);
  }
  originals.clear();
  vi.unstubAllGlobals();
});

async function bookshelf() {
  const vault = new Events();
  const workspace = new Events();
  const file = Object.assign(new TFile(), { path: "My Reader/book/book.epub", name: "book.epub", basename: "book", extension: "epub", stat: { size: 1, mtime: 1 } });
  const files = [file];
  const cover = Object.assign(new TFile(), { path: "My Reader/book/custom-cover.png", stat: { size: 10, mtime: 1 } });
  Object.assign(vault, { getAbstractFileByPath: (path: string) => path === cover.path ? cover : null });
  const data = createDefaultData();
  data.books[file.path] = { bookId: "book-test-identity", sourceSignature: file.stat, bookmarks: [], highlights: [] };
  const host = {
    store: { get snapshot() { return structuredClone(data); }, getBook: (path: string) => data.books[path] },
    getManagedFiles: () => files, getReaderSettings: () => data.settings,
    updateReaderSettings: vi.fn(), chooseImport: vi.fn(), openEpub: vi.fn(),
  } as unknown as BookshelfHost;
  const view = new OmniBookReaderBookshelfView({ app: { vault, workspace } } as unknown as WorkspaceLeaf, host);
  await view.onOpen();
  return { view, vault, workspace, data, file, files, cover };
}

describe("bookshelf refresh stability", () => {
  it("keeps the existing cards, loaded cover, search focus and scroll on unchanged library refresh", async () => {
    const { view } = await bookshelf();
    const card = document.querySelector<HTMLButtonElement>(".omni-book-reader-bookshelf-book")!;
    const cover = card.querySelector<HTMLElement>(".omni-book-reader-bookshelf-cover")!;
    const image = cover.createEl("img", { attr: { src: "blob:already-loaded-cover" } });
    cover.addClass("has-image");
    const search = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.focus();
    view.contentEl.scrollTop = 240;
    for (let index = 0; index < 5; index++) view.refresh();
    expect(document.querySelector(".omni-book-reader-bookshelf-book")).toBe(card);
    expect(image.isConnected).toBe(true);
    expect(document.activeElement).toBe(search);
    expect(view.contentEl.scrollTop).toBe(240);
  });

  it("does not recreate cards when unrelated files or workspace focus change", async () => {
    const { vault, workspace } = await bookshelf();
    const card = document.querySelector(".omni-book-reader-bookshelf-book");
    vault.emit("create", { path: "Other notes/new note.md" });
    vault.emit("rename", { path: "Other notes/renamed.md" }, "Other notes/new note.md");
    workspace.emit("active-leaf-change");
    expect(document.querySelector(".omni-book-reader-bookshelf-book")).toBe(card);
  });

  it("updates reading progress and annotation counts when library data changes", async () => {
    const { view, data, file } = await bookshelf();
    data.books[file.path].position = { cfi: "epubcfi(/6/2)", fraction: 0.42, updatedAt: 1 };
    data.books[file.path].bookmarks.push({ id: "bookmark", cfi: "epubcfi(/6/2)", fraction: 0.42, chapter: "Chapter", createdAt: 1 });
    view.refresh();
    const card = document.querySelector(".omni-book-reader-bookshelf-book")!;
    expect(card.textContent).toContain("42%");
    expect(card.textContent).toMatch(/1.*(书签|bookmarks)/);
    view.refresh();
    expect(document.querySelector(".omni-book-reader-bookshelf-book")).toBe(card);
  });

  it("refreshes display settings, filters and newly discovered or removed books", async () => {
    const { view, data, file, files } = await bookshelf();
    data.settings.bookshelfDisplayMode = "list";
    data.settings.bookshelfFilter = "reading-list";
    view.refresh();
    expect(view.contentEl.dataset.displayMode).toBe("list");
    expect(document.querySelector(".omni-book-reader-bookshelf-book")).toBeNull();
    data.books[file.path].inReadingList = true;
    view.refresh();
    expect(document.querySelectorAll(".omni-book-reader-bookshelf-book")).toHaveLength(1);
    files.push(Object.assign(new TFile(), { ...file, path: "My Reader/new/new.epub", basename: "new" }));
    data.settings.bookshelfFilter = "all";
    view.refresh();
    expect(document.querySelectorAll(".omni-book-reader-bookshelf-book")).toHaveLength(2);
    files.splice(0);
    view.refresh();
    expect(document.querySelectorAll(".omni-book-reader-bookshelf-book")).toHaveLength(0);
  });

  it("keeps a typed search across refreshes and applies it to changed book data", async () => {
    const { view, data, file } = await bookshelf();
    const input = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = "missing";
    input.dispatchEvent(new Event("input"));
    input.focus();
    view.refresh();
    expect(document.activeElement).toBe(input);
    expect(document.querySelector(".omni-book-reader-bookshelf-book")).toBeNull();
    data.books[file.path].inReadingList = true;
    view.refresh();
    expect(document.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe("missing");
    expect(document.querySelector(".omni-book-reader-bookshelf-book")).toBeNull();
  });

  it("updates a replaced custom cover even when its path stays the same", async () => {
    const { view, data, file, cover } = await bookshelf();
    data.books[file.path].customCoverPath = cover.path;
    view.refresh();
    const card = document.querySelector(".omni-book-reader-bookshelf-book");
    cover.stat.mtime++;
    view.refresh();
    expect(document.querySelector(".omni-book-reader-bookshelf-book")).not.toBe(card);
  });

  it("rebuilds the shelf when a closed view is opened again", async () => {
    const { view } = await bookshelf();
    await view.onClose();
    await view.onOpen();
    expect(document.querySelector(".omni-book-reader-bookshelf-book")).not.toBeNull();
  });
});
