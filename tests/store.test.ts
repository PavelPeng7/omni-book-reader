import { describe, expect, it } from "vitest";
import { ReaderDataStore, normalizeReaderData, type DataAdapter } from "../src/store";

class MemoryAdapter implements DataAdapter {
  value: unknown = null;
  saves: unknown[] = [];
  activeSaves = 0;
  maxConcurrentSaves = 0;

  async loadData(): Promise<unknown> {
    return this.value;
  }

  async saveData(data: unknown): Promise<void> {
    this.activeSaves += 1;
    this.maxConcurrentSaves = Math.max(this.maxConcurrentSaves, this.activeSaves);
    await Promise.resolve();
    this.saves.push(data);
    this.value = data;
    this.activeSaves -= 1;
  }
}

describe("reader data store", () => {
  it("normalizes persisted values and drops invalid CFIs", () => {
    const data = normalizeReaderData({
      schemaVersion: 3,
      settings: { theme: "dark", font: "publisher", fontSizePercent: 20, lineHeight: 1.6, contentWidth: 760, pageMargin: 32 },
      books: {
        "Books\\book.epub": {
          sourceSignature: { size: 100, mtime: 200 },
          position: { cfi: "not-a-cfi", fraction: 0.5, updatedAt: 1 },
          bookmarks: [
            { id: "b1", cfi: "epubcfi(/6/2!/4/2:0)", fraction: 2, chapter: "一", createdAt: 2 },
          ],
          highlights: [{
            id: "h1",
            cfi: "epubcfi(/6/2!/4/2:0)",
            text: "摘抄",
            chapter: "第一章",
            color: "blue",
            style: "invalid",
            tags: [" 原型 ", "原型", "心理 学"],
            sectionIndex: 1,
            createdAt: 3,
          }],
          annotationDocuments: {
            highlightPath: "Books\\book\\book-Highlight-2026-08-01.md",
            notePath: "Books\\book\\book-Note-2026-08-01.md",
            createdDate: "2026-08-01",
          },
          readingStats: {
            totalReadingMs: -10,
            lastOpenedAt: 100,
            lastReadAt: 120,
            furthestFraction: 2,
          },
        },
      },
    });
    expect(data.settings.fontSizePercent).toBe(80);
    expect(data.settings).toMatchObject({ font: "obsidian", lineHeight: 1.7, contentWidth: 720, pageMargin: 48 });
    expect(data.books["Books/book.epub"]?.position).toBeUndefined();
    expect(data.books["Books/book.epub"]?.bookmarks[0]?.fraction).toBe(1);
    expect(data.books["Books/book.epub"]?.annotationDocuments?.notePath).toBe("Books/book/book-Note-2026-08-01.md");
    expect(data.books["Books/book.epub"]?.highlights[0]?.style).toBe("highlight");
    expect(data.books["Books/book.epub"]?.highlights[0]?.tags).toEqual(["原型", "心理 学"]);
    expect(data.books["Books/book.epub"]?.readingStats).toMatchObject({ totalReadingMs: 0, furthestFraction: 1 });
    expect(data.schemaVersion).toBe(5);
  });

  it("preserves book data when the source signature changes", async () => {
    const adapter = new MemoryAdapter();
    const store = new ReaderDataStore(adapter);
    await store.load();
    const state = store.ensureBook("Books/book.epub", { size: 100, mtime: 1 });
    state.bookmarks.push({
      id: "b1",
      cfi: "epubcfi(/6/2!/4/2:0)",
      fraction: 0.25,
      chapter: "第一章",
      createdAt: 1,
    });
    store.markChanged(0);
    store.ensureBook("Books/book.epub", { size: 120, mtime: 2 });
    await store.flush();

    expect(store.getBook("Books/book.epub")?.sourceSignature).toEqual({ size: 120, mtime: 2 });
    expect(store.getBook("Books/book.epub")?.bookmarks).toHaveLength(1);
  });

  it("persists bookshelf-only metadata without trusting invalid cover paths", () => {
    const data = normalizeReaderData({
      books: {
        "Books/book.epub": {
          sourceSignature: { size: 1, mtime: 2 },
          bookmarks: [],
          highlights: [],
          hiddenFromBookshelf: true,
          inReadingList: true,
          customCoverPath: "C:\\outside.png",
        },
        "Books/cover.epub": {
          sourceSignature: { size: 1, mtime: 2 },
          bookmarks: [],
          highlights: [],
          customCoverPath: "Images\\cover.png",
        },
      },
    });

    expect(data.books["Books/book.epub"]).toMatchObject({ hiddenFromBookshelf: true, inReadingList: true });
    expect(data.books["Books/book.epub"]?.customCoverPath).toBeUndefined();
    expect(data.books["Books/cover.epub"]?.customCoverPath).toBe("Images/cover.png");
  });

  it("migrates state on rename and serializes overlapping saves", async () => {
    const adapter = new MemoryAdapter();
    const store = new ReaderDataStore(adapter);
    await store.load();
    store.ensureBook("Old/book.epub", { size: 1, mtime: 1 });
    const first = store.persist();
    store.renameBook("Old/book.epub", "New/book.epub");
    const second = store.persist();
    await Promise.all([first, second]);
    await store.flush();

    expect(store.getBook("Old/book.epub")).toBeUndefined();
    expect(store.getBook("New/book.epub")).toBeDefined();
    expect(adapter.maxConcurrentSaves).toBe(1);
  });
});
