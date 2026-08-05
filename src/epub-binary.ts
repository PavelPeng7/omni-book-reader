export interface EpubBinaryFile {
  path: string;
  stat: { size: number };
}

export interface EpubBinaryVault {
  readBinary(file: EpubBinaryFile): Promise<unknown>;
  adapter?: { readBinary?(path: string): Promise<unknown> };
  getResourcePath?(file: EpubBinaryFile): string;
}

function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
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
 * Read EPUB bytes through every Android-compatible Obsidian path. Some mobile
 * WebViews intermittently return an incomplete payload from vault.readBinary
 * before their resource bridge has warmed up, so callers must try each result.
 */
export async function readEpubBinaryCandidates(vault: EpubBinaryVault, file: EpubBinaryFile): Promise<Uint8Array[]> {
  const readers: Array<() => Promise<unknown>> = [
    () => vault.readBinary(file),
  ];
  if (typeof vault.adapter?.readBinary === "function") {
    readers.push(() => vault.adapter!.readBinary!(file.path));
  }
  const resourcePath = vault.getResourcePath?.(file);
  if (resourcePath) readers.push(() => readResourceBinary(resourcePath));

  const candidates: Uint8Array[] = [];
  for (const read of readers) {
    try {
      const bytes = toBytes(await read());
      if (!bytes || !isZip(bytes)) continue;
      candidates.push(bytes);
    } catch {
      // Continue with the next Obsidian file bridge.
    }
  }

  candidates.sort((a, b) => Number(b.byteLength === file.stat.size) - Number(a.byteLength === file.stat.size));
  if (!candidates.length) throw new Error(`Unable to read a valid EPUB ZIP payload: ${file.path}`);
  return candidates;
}
