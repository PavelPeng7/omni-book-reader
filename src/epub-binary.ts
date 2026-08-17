export interface EpubBinaryFile {
  path: string;
  stat: { size: number };
}

export interface EpubBinaryVault {
  readBinary(file: EpubBinaryFile): Promise<unknown>;
  adapter?: { readBinary?(path: string): Promise<unknown> };
  getResourcePath?(file: EpubBinaryFile): string;
}

export interface EpubBinaryReadOptions {
  validate?: (bytes: Uint8Array) => Promise<boolean>;
  retryDelaysMs?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
  isCancelled?: () => boolean;
}

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer
    || Object.prototype.toString.call(value) === "[object ArrayBuffer]";
}

function toBytes(value: unknown): Uint8Array | null {
  if (isArrayBuffer(value)) return Uint8Array.from(new Uint8Array(value));
  if (ArrayBuffer.isView(value)) {
    return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (Array.isArray(value)) return Uint8Array.from(value);

  // Some Android/WebView bridges serialize typed arrays into plain objects.
  if (value && typeof value === "object") {
    const binary = value as {
      buffer?: unknown;
      byteOffset?: unknown;
      byteLength?: unknown;
      length?: unknown;
      [index: number]: unknown;
    };
    if (isArrayBuffer(binary.buffer)) {
      const offset = Number.isInteger(binary.byteOffset) ? Number(binary.byteOffset) : 0;
      const available = binary.buffer.byteLength - offset;
      const length = Number.isInteger(binary.byteLength) ? Number(binary.byteLength) : available;
      if (offset >= 0 && length >= 0 && length <= available) {
        return Uint8Array.from(new Uint8Array(binary.buffer, offset, length));
      }
    }
    if (Number.isInteger(binary.length) && Number(binary.length) >= 0) {
      const length = Number(binary.length);
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index += 1) bytes[index] = Number(binary[index]);
      return bytes;
    }
  }
  return null;
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function readResourceBinary(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.onload = () => {
      if ((request.status === 0 || (request.status >= 200 && request.status < 300))
        && request.response instanceof ArrayBuffer) {
        resolve(request.response);
      } else {
        reject(new Error(`Resource request failed (${request.status})`));
      }
    };
    request.onerror = () => reject(new Error("Resource request failed"));
    request.send();
  });
}

/**
 * Read EPUB bytes through every Android-compatible Obsidian path. Each payload
 * is validated before it is selected, and failed rounds are retried briefly so
 * Android has time to materialize a newly synced file.
 */
export async function readEpubBinaryCandidates(
  vault: EpubBinaryVault,
  file: EpubBinaryFile,
  options: EpubBinaryReadOptions = {},
): Promise<Uint8Array[]> {
  const readers: Array<{ name: string; read: () => Promise<unknown> }> = [
    { name: "vault", read: () => vault.readBinary(file) },
  ];
  if (typeof vault.adapter?.readBinary === "function") {
    const readBinary = vault.adapter.readBinary.bind(vault.adapter);
    readers.push({ name: "adapter", read: () => readBinary(file.path) });
  }
  if (vault.getResourcePath) {
    readers.push({
      name: "resource",
      read: async () => {
        const resourcePath = vault.getResourcePath?.(file);
        if (!resourcePath) throw new Error("Resource path is unavailable");
        return readResourceBinary(resourcePath);
      },
    });
  }

  const validate = options.validate ?? (async (bytes: Uint8Array) => isZip(bytes));
  const retryDelays = options.retryDelaysMs ?? [0, 250, 1_000, 2_500];
  const wait = options.wait ?? ((delayMs: number) => new Promise<void>(
    (resolve) => window.setTimeout(resolve, delayMs),
  ));
  const diagnostics = new Map<string, string>();

  for (const delayMs of retryDelays) {
    if (options.isCancelled?.()) throw new Error("EPUB loading was cancelled");
    if (delayMs > 0) await wait(delayMs);

    const candidates: Uint8Array[] = [];
    for (const reader of readers) {
      if (options.isCancelled?.()) throw new Error("EPUB loading was cancelled");
      try {
        const bytes = toBytes(await reader.read());
        if (!bytes) {
          diagnostics.set(reader.name, "unsupported binary response");
          continue;
        }
        if (!isZip(bytes)) {
          diagnostics.set(reader.name, `${bytes.byteLength} bytes, missing ZIP header`);
          continue;
        }
        if (!await validate(bytes)) {
          diagnostics.set(reader.name, `${bytes.byteLength} bytes, incomplete EPUB archive`);
          continue;
        }
        diagnostics.set(reader.name, `${bytes.byteLength} bytes, valid`);
        candidates.push(bytes);
        if (bytes.byteLength === file.stat.size) return [bytes];
      } catch (error) {
        diagnostics.set(reader.name, error instanceof Error ? error.message : "read failed");
      }
    }

    candidates.sort((a, b) => {
      const exact = Number(b.byteLength === file.stat.size) - Number(a.byteLength === file.stat.size);
      return exact || b.byteLength - a.byteLength;
    });
    if (candidates.length) return candidates;
  }

  const detail = [...diagnostics].map(([name, result]) => `${name}: ${result}`).join("; ");
  throw new Error(`Unable to read a complete EPUB payload: ${file.path}${detail ? ` (${detail})` : ""}`);
}
