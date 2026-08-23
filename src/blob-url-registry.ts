type BinaryBlob = { bytes: Uint8Array; mimeType: string };

const PATCH_FLAG = "__omniBlobRegistryInstalled__";
const ORIGINAL_CREATE_KEY = "__omniOriginalCreateObjectUrl__";
const ORIGINAL_REVOKE_KEY = "__omniOriginalRevokeObjectUrl__";

type RegistryWindow = typeof window & {
  [PATCH_FLAG]?: boolean;
  [ORIGINAL_CREATE_KEY]?: (blob: Blob) => string;
  [ORIGINAL_REVOKE_KEY]?: (url: string) => void;
};

const blobs = new Map<string, Blob>();
const textCache = new Map<string, string>();
const binaryCache = new Map<string, BinaryBlob>();
const BLOB_URL_PATTERN = /blob:[^\s"'<>)\]]+/gi;

function normalizedUrl(url: string): string {
  return String(url ?? "").trim();
}

function arrayBufferLike(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer
    || Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : ""));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read Blob text")));
    reader.readAsText(blob);
  });
}

async function readBlobBinary(blob: Blob): Promise<BinaryBlob> {
  let result: unknown;
  if (typeof blob.arrayBuffer === "function") result = await blob.arrayBuffer();
  else {
    result = await new Promise<unknown>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read Blob binary")));
      reader.readAsArrayBuffer(blob);
    });
  }
  if (!arrayBufferLike(result)) throw new Error("Blob did not produce an ArrayBuffer");
  return {
    bytes: new Uint8Array(result),
    mimeType: blob.type.trim().toLowerCase() || "application/octet-stream",
  };
}

export function isBlobResourceUrl(url: string): boolean {
  return normalizedUrl(url).toLowerCase().startsWith("blob:");
}

export function collectBlobResourceUrls(source: string): string[] {
  const urls = new Set<string>();
  for (const match of String(source ?? "").matchAll(BLOB_URL_PATTERN)) {
    const url = normalizedUrl(match[0] ?? "");
    if (isBlobResourceUrl(url)) urls.add(url);
  }
  return [...urls];
}

export function registerBlobUrl(url: string, blob: Blob): void {
  const normalized = normalizedUrl(url);
  if (isBlobResourceUrl(normalized)) blobs.set(normalized, blob);
}

export function getRegisteredBlob(url: string): Blob | null {
  return blobs.get(normalizedUrl(url)) ?? null;
}

export function getCachedBlobText(url: string): string | null {
  const normalized = normalizedUrl(url);
  return textCache.has(normalized) ? textCache.get(normalized) ?? "" : null;
}

export function getCachedBlobBinary(url: string): BinaryBlob | null {
  return binaryCache.get(normalizedUrl(url)) ?? null;
}

export function cacheBlobText(url: string, text: string): void {
  const normalized = normalizedUrl(url);
  if (normalized) textCache.set(normalized, text);
}

export function cacheBlobBinary(url: string, binary: BinaryBlob): void {
  const normalized = normalizedUrl(url);
  if (normalized) binaryCache.set(normalized, binary);
}

export async function readRegisteredBlobAsText(url: string): Promise<string | null> {
  const cached = getCachedBlobText(url);
  if (cached !== null) return cached;
  const blob = getRegisteredBlob(url);
  if (!blob) return null;
  const text = await readBlobText(blob);
  cacheBlobText(url, text);
  return text;
}

export async function readRegisteredBlobAsArrayBuffer(url: string): Promise<BinaryBlob | null> {
  const cached = getCachedBlobBinary(url);
  if (cached) return cached;
  const blob = getRegisteredBlob(url);
  if (!blob) return null;
  const binary = await readBlobBinary(blob);
  cacheBlobBinary(url, binary);
  return binary;
}

/** Retain Foliate Blob objects even after their object URL is revoked. */
export function installBlobUrlRegistry(urlApi: typeof URL = URL): void {
  const scope = window as RegistryWindow;
  if (scope[PATCH_FLAG]) return;
  const createValue = Reflect.get(urlApi, "createObjectURL") as unknown;
  const revokeValue = Reflect.get(urlApi, "revokeObjectURL") as unknown;
  if (typeof createValue !== "function" || typeof revokeValue !== "function") return;

  const originalCreate = createValue as (blob: Blob) => string;
  const originalRevoke = revokeValue as (url: string) => void;
  scope[ORIGINAL_CREATE_KEY] = originalCreate;
  scope[ORIGINAL_REVOKE_KEY] = originalRevoke;
  urlApi.createObjectURL = (blob: Blob): string => {
    const url = Reflect.apply(originalCreate, urlApi, [blob]);
    registerBlobUrl(url, blob);
    return url;
  };
  urlApi.revokeObjectURL = (url: string): void => {
    try { Reflect.apply(originalRevoke, urlApi, [url]); } catch { /* Best effort. */ }
  };
  scope[PATCH_FLAG] = true;
}

export function resetBlobUrlRegistryForTests(): void {
  const scope = window as RegistryWindow;
  if (scope[ORIGINAL_CREATE_KEY]) URL.createObjectURL = scope[ORIGINAL_CREATE_KEY];
  if (scope[ORIGINAL_REVOKE_KEY]) URL.revokeObjectURL = scope[ORIGINAL_REVOKE_KEY];
  delete scope[PATCH_FLAG];
  delete scope[ORIGINAL_CREATE_KEY];
  delete scope[ORIGINAL_REVOKE_KEY];
  blobs.clear();
  textCache.clear();
  binaryCache.clear();
}
