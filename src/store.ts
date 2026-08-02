import { createDefaultData, normalizeSettings } from "./defaults";
import type {
  AnnotationDocuments,
  BookState,
  Bookmark,
  ReaderData,
  ReaderHighlight,
  ReadingStats,
  ReaderSettings,
  ReadingPosition,
  SourceSignature,
} from "./types";
import { isValidCfi, normalizeVaultPath } from "./utils";

export interface DataAdapter {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

const finite = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const fraction = (value: unknown): number => Math.min(1, Math.max(0, finite(value)));

function normalizePosition(value: unknown): ReadingPosition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<ReadingPosition>;
  if (!isValidCfi(input.cfi)) return undefined;
  return {
    cfi: input.cfi.trim(),
    fraction: fraction(input.fraction),
    updatedAt: finite(input.updatedAt, Date.now()),
  };
}

function normalizeBookmark(value: unknown): Bookmark | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<Bookmark>;
  if (!isValidCfi(input.cfi) || typeof input.id !== "string") return null;
  return {
    id: input.id,
    cfi: input.cfi.trim(),
    fraction: fraction(input.fraction),
    chapter: typeof input.chapter === "string" ? input.chapter : "未命名章节",
    createdAt: finite(input.createdAt, Date.now()),
    stale: input.stale === true || undefined,
  };
}

function normalizeHighlight(value: unknown): ReaderHighlight | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ReaderHighlight>;
  if (!isValidCfi(input.cfi) || typeof input.id !== "string" || typeof input.text !== "string") return null;
  const colors = new Set(["yellow", "green", "blue", "pink"]);
  const styles = new Set(["highlight", "underline", "strikethrough", "squiggly"]);
  const tags = Array.isArray(input.tags)
    ? Array.from(new Set(input.tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.replace(/\s+/g, " ").trim().slice(0, 50))
      .filter(Boolean)))
      .slice(0, 20)
    : [];
  return {
    id: input.id,
    cfi: input.cfi.trim(),
    text: input.text.slice(0, 10000),
    chapter: typeof input.chapter === "string" ? input.chapter : "未命名章节",
    color: colors.has(String(input.color)) ? input.color as ReaderHighlight["color"] : "yellow",
    style: styles.has(String(input.style)) ? input.style as ReaderHighlight["style"] : "highlight",
    tags,
    sectionIndex: Math.max(0, Math.round(finite(input.sectionIndex))),
    createdAt: finite(input.createdAt, Date.now()),
    note: typeof input.note === "string" && input.note.trim()
      ? input.note.trim().slice(0, 20000)
      : undefined,
    noteUpdatedAt: typeof input.noteUpdatedAt === "number" && Number.isFinite(input.noteUpdatedAt)
      ? input.noteUpdatedAt
      : undefined,
    stale: input.stale === true || undefined,
  };
}

function normalizeAnnotationDocuments(value: unknown): AnnotationDocuments | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<AnnotationDocuments>;
  const highlightPath = normalizeVaultPath(input.highlightPath ?? "");
  const notePath = normalizeVaultPath(input.notePath ?? "");
  if (!highlightPath.toLowerCase().endsWith(".md") || !notePath.toLowerCase().endsWith(".md")) return undefined;
  return {
    highlightPath,
    notePath,
    createdDate: typeof input.createdDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.createdDate)
      ? input.createdDate
      : "",
  };
}

function normalizeReadingStats(value: unknown): ReadingStats | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<ReadingStats>;
  const totalReadingMs = Math.max(0, finite(input.totalReadingMs));
  const lastOpenedAt = Math.max(0, finite(input.lastOpenedAt));
  const lastReadAt = Math.max(0, finite(input.lastReadAt));
  const furthestFraction = fraction(input.furthestFraction);
  const completedAt = Math.max(0, finite(input.completedAt));
  if (!totalReadingMs && !lastOpenedAt && !lastReadAt && !furthestFraction && !completedAt) return undefined;
  return {
    totalReadingMs,
    lastOpenedAt,
    lastReadAt,
    furthestFraction,
    ...(completedAt ? { completedAt } : {}),
  };
}

function normalizeBookState(value: unknown): BookState {
  const input = value && typeof value === "object" ? value as Partial<BookState> : {};
  const signature = input.sourceSignature && typeof input.sourceSignature === "object"
    ? input.sourceSignature
    : { size: 0, mtime: 0 };
  const position = normalizePosition(input.position);
  const annotationDocuments = normalizeAnnotationDocuments(input.annotationDocuments);
  const readingStats = normalizeReadingStats(input.readingStats);
  const normalizedCoverPath = normalizeVaultPath(input.customCoverPath ?? "");
  const customCoverPath = /^(?:[A-Za-z]:|\/)/.test(normalizedCoverPath) ? "" : normalizedCoverPath;
  return {
    sourceSignature: {
      size: Math.max(0, finite(signature.size)),
      mtime: Math.max(0, finite(signature.mtime)),
    },
    ...(position ? { position } : {}),
    bookmarks: Array.isArray(input.bookmarks)
      ? input.bookmarks.map(normalizeBookmark).filter((item): item is Bookmark => item !== null)
      : [],
    highlights: Array.isArray(input.highlights)
      ? input.highlights.map(normalizeHighlight).filter((item): item is ReaderHighlight => item !== null)
      : [],
    ...(annotationDocuments ? { annotationDocuments } : {}),
    ...(readingStats ? { readingStats } : {}),
    ...(input.hiddenFromBookshelf === true ? { hiddenFromBookshelf: true } : {}),
    ...(input.inReadingList === true ? { inReadingList: true } : {}),
    ...(customCoverPath ? { customCoverPath } : {}),
  };
}

export function normalizeReaderData(value: unknown): ReaderData {
  if (!value || typeof value !== "object") return createDefaultData();
  const input = value as Partial<ReaderData> & { schemaVersion?: number };
  const books: Record<string, BookState> = {};
  if (input.books && typeof input.books === "object") {
    for (const [path, state] of Object.entries(input.books)) {
      const normalizedPath = normalizeVaultPath(path);
      if (normalizedPath) books[normalizedPath] = normalizeBookState(state);
    }
  }
  const previousSettings: Partial<ReaderSettings> = input.settings && typeof input.settings === "object" ? input.settings : {};
  const migrateLegacyTypography = (input.schemaVersion ?? 0) < 4;
  const migratedSettings = migrateLegacyTypography ? {
    ...previousSettings,
    font: previousSettings.font === "publisher" ? "obsidian" : previousSettings.font,
    lineHeight: previousSettings.lineHeight === 1.6 ? 1.7 : previousSettings.lineHeight,
    contentWidth: previousSettings.contentWidth === 760 ? 720 : previousSettings.contentWidth,
    pageMargin: previousSettings.pageMargin === 32 ? 48 : previousSettings.pageMargin,
  } : previousSettings;
  return {
    schemaVersion: 5,
    settings: normalizeSettings(migratedSettings),
    books,
  };
}

export class ReaderDataStore {
  private data: ReaderData = createDefaultData();
  private saveTimer: number | null = null;
  private saveChain: Promise<void> = Promise.resolve();
  private dirty = false;

  constructor(
    private readonly adapter: DataAdapter,
    private readonly onError: (error: unknown) => void = console.error,
  ) {}

  async load(): Promise<void> {
    try {
      this.data = normalizeReaderData(await this.adapter.loadData());
    } catch (error) {
      this.onError(error);
      this.data = createDefaultData();
    }
  }

  get settings(): ReaderSettings {
    return this.data.settings;
  }

  get snapshot(): ReaderData {
    return structuredClone(this.data);
  }

  updateSettings(patch: Partial<ReaderSettings>): ReaderSettings {
    this.data.settings = normalizeSettings({ ...this.data.settings, ...patch });
    this.markChanged(100);
    return this.data.settings;
  }

  ensureBook(path: string, signature: SourceSignature): BookState {
    const key = normalizeVaultPath(path);
    let state = this.data.books[key];
    if (!state) {
      state = normalizeBookState({ sourceSignature: signature });
      this.data.books[key] = state;
      this.markChanged(100);
    } else if (state.sourceSignature.size !== signature.size || state.sourceSignature.mtime !== signature.mtime) {
      state.sourceSignature = { ...signature };
      this.markChanged(100);
    }
    return state;
  }

  getBook(path: string): BookState | undefined {
    return this.data.books[normalizeVaultPath(path)];
  }

  renameBook(oldPath: string, newPath: string): void {
    const oldKey = normalizeVaultPath(oldPath);
    const newKey = normalizeVaultPath(newPath);
    if (!oldKey || !newKey || oldKey === newKey) return;
    const oldState = this.data.books[oldKey];
    if (!oldState) return;
    const existing = this.data.books[newKey];
    this.data.books[newKey] = existing ? {
      sourceSignature: oldState.sourceSignature,
      position: [oldState.position, existing.position]
        .filter((item): item is ReadingPosition => Boolean(item))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0],
      bookmarks: this.mergeById(existing.bookmarks, oldState.bookmarks),
      highlights: this.mergeById(existing.highlights, oldState.highlights),
      annotationDocuments: oldState.annotationDocuments ?? existing.annotationDocuments,
      hiddenFromBookshelf: oldState.hiddenFromBookshelf ?? existing.hiddenFromBookshelf,
      inReadingList: oldState.inReadingList ?? existing.inReadingList,
      customCoverPath: oldState.customCoverPath ?? existing.customCoverPath,
      readingStats: [oldState.readingStats, existing.readingStats]
        .filter((item): item is ReadingStats => Boolean(item))
        .sort((a, b) => b.lastReadAt - a.lastReadAt)[0],
    } : oldState;
    delete this.data.books[oldKey];
    this.markChanged(0);
  }

  removeBook(path: string): void {
    const key = normalizeVaultPath(path);
    if (!key || !this.data.books[key]) return;
    delete this.data.books[key];
    this.markChanged(0);
  }

  markChanged(delayMs = 250): void {
    this.dirty = true;
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.persist();
    }, Math.max(0, delayMs));
  }

  async persist(): Promise<void> {
    if (!this.dirty) return this.saveChain;
    this.dirty = false;
    const snapshot = structuredClone(this.data);
    this.saveChain = this.saveChain
      .catch(() => undefined)
      .then(() => this.adapter.saveData(snapshot))
      .catch((error) => {
        this.dirty = true;
        this.onError(error);
      });
    return this.saveChain;
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.persist();
    await this.saveChain;
  }

  private mergeById<T extends { id: string }>(left: T[], right: T[]): T[] {
    return Array.from(new Map([...left, ...right].map((item) => [item.id, item])).values());
  }
}
