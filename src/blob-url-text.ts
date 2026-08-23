import {
  cacheBlobBinary,
  cacheBlobText,
  collectBlobResourceUrls,
  getCachedBlobBinary,
  getCachedBlobText,
  getRegisteredBlob,
  isBlobResourceUrl,
  readRegisteredBlobAsArrayBuffer,
  readRegisteredBlobAsText,
} from "./blob-url-registry";

export { collectBlobResourceUrls, isBlobResourceUrl } from "./blob-url-registry";

type BinaryResource = { bytes: Uint8Array; mimeType: string };

function successfulStatus(status: number): boolean {
  return status === 0 || (status >= 200 && status < 300);
}

function arrayBufferLike(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer
    || Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

function readUrl(
  url: string,
  responseType: "text" | "arraybuffer",
): Promise<{ data: string | ArrayBuffer; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = responseType;
    request.addEventListener("load", () => {
      if (!successfulStatus(request.status)) {
        reject(new Error(`Resource request failed (${request.status})`));
        return;
      }
      const mimeType = (request.getResponseHeader("content-type") ?? "application/octet-stream")
        .trim().toLowerCase();
      if (responseType === "text") {
        resolve({ data: request.responseText ?? "", mimeType });
        return;
      }
      if (arrayBufferLike(request.response)) {
        resolve({ data: request.response, mimeType });
        return;
      }
      reject(new Error("Resource did not produce an ArrayBuffer"));
    });
    request.addEventListener("error", () => reject(new Error("Resource request failed")));
    request.send();
  });
}

export async function prefetchBlobResourceUrls(urls: Iterable<string>): Promise<void> {
  await Promise.all([...urls]
    .map((url) => String(url ?? "").trim())
    .filter(isBlobResourceUrl)
    .filter((url) => getCachedBlobText(url) === null && getCachedBlobBinary(url) === null)
    .map(async (url) => {
      if (getRegisteredBlob(url)) await readRegisteredBlobAsText(url).catch(() => null);
      else await readBlobUrlAsText(url).catch(() => "");
    }));
}

export async function prefetchBlobUrlsFromText(source: string): Promise<void> {
  await prefetchBlobResourceUrls(collectBlobResourceUrls(source));
}

export async function readBlobUrlAsText(url: string): Promise<string> {
  const normalized = String(url ?? "").trim();
  if (!isBlobResourceUrl(normalized)) throw new Error(`Not a Blob URL: ${normalized}`);
  const cached = getCachedBlobText(normalized);
  if (cached !== null) return cached;
  const registered = await readRegisteredBlobAsText(normalized);
  if (registered !== null) return registered;
  const { data } = await readUrl(normalized, "text");
  const text = data as string;
  cacheBlobText(normalized, text);
  return text;
}

export async function readBlobUrlAsArrayBuffer(url: string): Promise<BinaryResource> {
  const normalized = String(url ?? "").trim();
  if (!isBlobResourceUrl(normalized)) throw new Error(`Not a Blob URL: ${normalized}`);
  const cached = getCachedBlobBinary(normalized);
  if (cached) return cached;
  const registered = await readRegisteredBlobAsArrayBuffer(normalized);
  if (registered) return registered;
  const { data, mimeType } = await readUrl(normalized, "arraybuffer");
  const binary = { bytes: new Uint8Array(data as ArrayBuffer), mimeType };
  cacheBlobBinary(normalized, binary);
  return binary;
}

export async function readResourceUrlAsText(url: string): Promise<string> {
  if (isBlobResourceUrl(url)) return readBlobUrlAsText(url);
  return (await readUrl(url, "text")).data as string;
}

export async function readResourceUrlAsArrayBuffer(url: string): Promise<ArrayBuffer> {
  if (isBlobResourceUrl(url)) {
    const { bytes } = await readBlobUrlAsArrayBuffer(url);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  return (await readUrl(url, "arraybuffer")).data as ArrayBuffer;
}

export async function readResourceUrlAsBinary(url: string): Promise<BinaryResource> {
  if (isBlobResourceUrl(url)) return readBlobUrlAsArrayBuffer(url);
  const { data, mimeType } = await readUrl(url, "arraybuffer");
  return { bytes: new Uint8Array(data as ArrayBuffer), mimeType };
}
