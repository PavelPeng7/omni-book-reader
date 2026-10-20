import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", async (original) => ({
  ...await original<typeof import("obsidian")>(),
  App: class {}, Plugin: class {}, Modal: class {}, FuzzySuggestModal: class {},
  Menu: class {}, TFile: class {}, Notice: vi.fn(), setIcon: vi.fn(),
}));
vi.mock("../src/reader-view", () => ({
  OMNI_BOOK_READER_VIEW_TYPE: "reader",
  OmniBookReaderView: class {
    file = { path: "My Reader/Book/book.epub" };
    applySettings = vi.fn();
    onLoadFile = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock("../src/bookshelf-view", () => ({
  OMNI_BOOK_READER_BOOKSHELF_VIEW_TYPE: "shelf", OmniBookReaderBookshelfView: class {},
}));
vi.mock("../src/settings-ui", () => ({ OmniBookReaderSettingTab: class {} }));

import OmniBookReaderPlugin from "../src/main";
import { OmniBookReaderView } from "../src/reader-view";
import { ReaderDataStore } from "../src/store";
import { createDefaultData } from "../src/defaults";

function setup() {
  let available = false;
  const data = createDefaultData();
  data.settings.fontSizePercent = 140;
  data.books["My Reader/Book/book.epub"] = {
    bookId: "book-1234567890123456", sourceSignature: { size: 1, mtime: 1 }, bookmarks: [], highlights: [],
  };
  const adapter = {
    loadData: vi.fn(async () => {
      if (!available) throw new Error("Vault index unavailable");
      return data;
    }),
    saveData: vi.fn(),
  };
  const errors = vi.fn();
  const store = new ReaderDataStore(adapter, errors);
  const reader = new OmniBookReaderView(undefined as never, undefined as never);
  const library = {
    run: async (task: () => Promise<unknown>) => task(),
    discover: vi.fn(async () => data),
    project: () => data.books,
    problems: [],
  };
  const plugin = Object.assign(Object.create(OmniBookReaderPlugin.prototype), {
    store, library,
    app: { workspace: { getLeavesOfType: (type: string) => type === "reader" ? [{ view: reader }] : [] } },
    refreshBookshelves: vi.fn(), reportLibraryError: vi.fn(),
  }) as OmniBookReaderPlugin;
  return { plugin, store, reader, adapter, errors, library, enable: () => { available = true; } };
}

describe("library startup recovery", () => {
  it("retries loading before flushing fallback state and resumes restored reader leaves", async () => {
    const { plugin, store, reader, adapter, enable } = setup();
    expect(await store.load()).toBe(false);
    store.updateSettings({ fontSizePercent: 100 });
    enable();
    await plugin.refreshLibrary();
    expect(store.isLoaded).toBe(true);
    expect(store.settings.fontSizePercent).toBe(140);
    expect(adapter.saveData).not.toHaveBeenCalled();
    expect(reader.applySettings).toHaveBeenCalledOnce();
    expect(reader.onLoadFile).toHaveBeenCalledWith(reader.file);
  });

  it("keeps persistent initialization failures blocked and skips discovery", async () => {
    const { plugin, store, library, adapter, errors } = setup();
    await store.load();
    await plugin.refreshLibrary();
    expect(store.isLoaded).toBe(false);
    expect(library.discover).not.toHaveBeenCalled();
    expect(adapter.saveData).not.toHaveBeenCalled();
    expect(errors.mock.calls.every(([error]) => error.message === "Vault index unavailable")).toBe(true);
  });

  it("shares overlapping recovery loads", async () => {
    const { plugin, store, adapter, enable } = setup();
    await store.load();
    enable();
    await Promise.all([plugin.refreshLibrary(), plugin.refreshLibrary()]);
    expect(adapter.loadData).toHaveBeenCalledTimes(2);
    expect(store.isLoaded).toBe(true);
  });

  it("does not flush fallback state when a failed plugin is unloaded", async () => {
    const { plugin, store } = setup();
    await store.load();
    const flush = vi.spyOn(store, "flush");
    plugin.onunload();
    expect(flush).not.toHaveBeenCalled();
  });
});
