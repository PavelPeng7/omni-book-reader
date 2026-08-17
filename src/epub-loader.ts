import { EPUB } from "foliate-js/epub.js";
import {
  BlobReader,
  BlobWriter,
  TextWriter,
  ZipReader,
  configure,
} from "foliate-js/vendor/zip.js";
import type { FoliateBook } from "./types";

interface ZipEntry {
  filename: string;
  directory?: boolean;
  uncompressedSize?: number;
  getData<T>(writer: unknown): Promise<T>;
}

export interface EpubLoadProgress {
  phase: "archive" | "metadata";
  loaded: number;
  total: number;
}

function normalizeEntryPath(value: string): string {
  let path = value.split(/[?#]/, 1)[0]?.replaceAll("\\", "/") ?? "";
  try { path = decodeURIComponent(path); } catch { /* Keep the encoded path as a fallback. */ }
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

async function openArchive(
  bytes: Uint8Array,
  onProgress?: (progress: EpubLoadProgress) => void,
) {
  configure({ useWebWorkers: false });
  const archive = new ZipReader(new BlobReader(new Blob([bytes], { type: "application/epub+zip" })));
  try {
    const entries = await archive.getEntries({
      onprogress: (loaded: number, total: number) => onProgress?.({ phase: "archive", loaded, total }),
    }) as ZipEntry[];
    return { archive, entries };
  } catch (error) {
    await archive.close().catch(() => undefined);
    throw error;
  }
}

/**
 * Confirm that a candidate is a readable EPUB archive before selecting it.
 * Android storage bridges can briefly return a ZIP-looking but incomplete
 * payload while a synced file is being materialized.
 */
export async function isReadableEpubArchive(bytes: Uint8Array): Promise<boolean> {
  let opened: Awaited<ReturnType<typeof openArchive>> | null = null;
  try {
    opened = await openArchive(bytes);
    return opened.entries.some(
      (entry) => normalizeEntryPath(entry.filename) === "META-INF/container.xml",
    );
  } catch {
    return false;
  } finally {
    if (opened) await opened.archive.close().catch(() => undefined);
  }
}

/**
 * Open EPUB bytes through Foliate's archive primitives instead of handing an
 * opaque File back to the mobile WebView. This mirrors Weave's vault-backed
 * loader and makes archive validation and progress observable.
 */
export async function createEpubBook(
  bytes: Uint8Array,
  onProgress?: (progress: EpubLoadProgress) => void,
): Promise<FoliateBook> {
  const { archive, entries } = await openArchive(bytes, onProgress);

  const lookup = new Map<string, ZipEntry>();
  for (const entry of entries) {
    if (entry.directory) continue;
    lookup.set(normalizeEntryPath(entry.filename), entry);
  }
  const findEntry = (path: string): ZipEntry | undefined => lookup.get(normalizeEntryPath(path));
  if (!findEntry("META-INF/container.xml")) {
    await archive.close();
    throw new Error("EPUB is missing META-INF/container.xml");
  }

  const loadText = async (path: string): Promise<string | null> => {
    const entry = findEntry(path);
    return entry ? entry.getData<string>(new TextWriter()) : null;
  };
  const loadBlob = async (path: string): Promise<Blob | null> => {
    const entry = findEntry(path);
    return entry ? entry.getData<Blob>(new BlobWriter()) : null;
  };
  const getSize = (path: string): number => findEntry(path)?.uncompressedSize ?? 0;

  try {
    onProgress?.({ phase: "metadata", loaded: 0, total: 1 });
    const book = await new EPUB({ loadText, loadBlob, getSize }).init() as FoliateBook;
    onProgress?.({ phase: "metadata", loaded: 1, total: 1 });
    const destroy = book.destroy?.bind(book);
    book.destroy = () => {
      destroy?.();
      void archive.close();
    };
    return book;
  } catch (error) {
    await archive.close();
    throw error;
  }
}

export function bookLoadTimeout(size: number): number {
  const extraBlocks = Math.max(0, Math.ceil((size - 50 * 1024 * 1024) / (50 * 1024 * 1024)));
  return Math.min(5 * 60_000, 45_000 + extraBlocks * 60_000);
}

export async function withLoadTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onSlow?: () => void,
): Promise<T> {
  let slowTimer: number | undefined;
  let timeoutTimer: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        slowTimer = window.setTimeout(() => onSlow?.(), Math.min(15_000, Math.max(1_000, timeoutMs / 3)));
        timeoutTimer = window.setTimeout(() => reject(new Error(`Book loading timed out after ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
      }),
    ]);
  } finally {
    if (slowTimer !== undefined) window.clearTimeout(slowTimer);
    if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer);
  }
}
