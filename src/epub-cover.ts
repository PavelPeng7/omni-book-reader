import { makeBook } from "foliate-js/view.js";
import { sanitizeTransformData } from "./sanitizer";

interface CoverResource {
  href?: string;
  mediaType?: string;
}

interface CoverBook {
  getCover?: () => Promise<Blob | null>;
  loadDocument?: (item: CoverResource) => Promise<Document>;
  loadBlob?: (href: string) => Promise<Blob | ArrayBuffer | Uint8Array | null>;
  resources?: {
    cover?: CoverResource;
    manifest?: CoverResource[];
  };
  destroy?: () => void;
}

function bytesStartWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function blobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Unable to read EPUB cover data"));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read EPUB cover data")));
    reader.readAsArrayBuffer(blob);
  });
}

async function detectImageType(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blobArrayBuffer(blob.slice(0, 512)));
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytesStartWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (bytesStartWith(bytes, [0x42, 0x4d])) return "image/bmp";
  if (bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && bytesStartWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  const prefix = new TextDecoder().decode(bytes).replace(/^[\s\uFEFF]+/, "");
  if (/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(prefix)) return "image/svg+xml";
  return null;
}

async function normalizeCoverBlob(blob: Blob | null | undefined): Promise<Blob | null> {
  if (!blob?.size) return null;
  const declaredType = blob.type.toLowerCase().split(";")[0]?.trim() ?? "";
  const detectedType = await detectImageType(blob);
  const type = detectedType ?? (declaredType.startsWith("image/") ? declaredType : null);
  if (!type) return null;
  const typedBlob = blob.type === type ? blob : new Blob([blob], { type });
  if (type === "image/svg+xml") {
    const sanitized = await sanitizeTransformData(typedBlob, type);
    return sanitized instanceof Blob ? sanitized : new Blob([sanitized], { type });
  }
  return typedBlob;
}

function resolveResourcePath(source: string, baseHref: string): string | null {
  const trimmed = source.trim();
  if (!trimmed || /^(?:data|blob|https?):/i.test(trimmed) || trimmed.startsWith("//")) return null;
  try {
    const url = new URL(trimmed, `https://epub.invalid/${baseHref}`);
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

async function coverFromDocument(book: CoverBook, resource: CoverResource): Promise<Blob | null> {
  if (!resource.href || !book.loadDocument || !book.loadBlob) return null;
  let document: Document;
  try {
    document = await book.loadDocument(resource);
  } catch {
    return null;
  }
  const image = document.querySelector("img[src], image[href], image[xlink\\:href]");
  const source = image?.getAttribute("src")
    ?? image?.getAttribute("href")
    ?? image?.getAttribute("xlink:href");
  if (!source) return null;
  const href = resolveResourcePath(source, resource.href);
  if (!href) return null;
  const data = await book.loadBlob(href);
  if (!data) return null;
  const manifestType = book.resources?.manifest?.find((item) => item.href === href)?.mediaType ?? "";
  return normalizeCoverBlob(data instanceof Blob ? data : new Blob([data], { type: manifestType }));
}

export async function extractEpubCover(file: File): Promise<Blob | null> {
  const book = await makeBook(file) as CoverBook;
  try {
    const declaredCover = await normalizeCoverBlob(await book.getCover?.());
    if (declaredCover) return declaredCover;
    const coverResource = book.resources?.cover;
    return coverResource ? await coverFromDocument(book, coverResource) : null;
  } finally {
    book.destroy?.();
  }
}
