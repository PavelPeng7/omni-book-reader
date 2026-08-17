import { describe, expect, it } from "vitest";
import { readEpubBinaryCandidates } from "../src/epub-binary";

const invalid = new Uint8Array([0, 1, 2, 3]).buffer;
const epub = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]).buffer;

describe("readEpubBinaryCandidates", () => {
  it("falls back from an invalid vault payload to the adapter binary", async () => {
    const result = await readEpubBinaryCandidates({
      readBinary: async () => invalid,
      adapter: { readBinary: async () => epub },
    }, { path: "Books/example.epub", stat: { size: 6 } });

    expect(result).toHaveLength(1);
    expect(Array.from(result[0]!)).toEqual([0x50, 0x4b, 0x03, 0x04, 1, 2]);
  });

  it("rejects when no Obsidian reader returns an EPUB ZIP", async () => {
    await expect(readEpubBinaryCandidates({
      readBinary: async () => invalid,
    }, { path: "Books/example.epub", stat: { size: 4 } }, {
      retryDelaysMs: [0],
    })).rejects.toThrow("complete EPUB payload");
  });

  it("normalizes Android bridge objects that wrap an ArrayBuffer", async () => {
    const result = await readEpubBinaryCandidates({
      readBinary: async () => ({
        buffer: epub,
        byteOffset: 0,
        byteLength: 6,
      }),
    }, { path: "Books/example.epub", stat: { size: 6 } });

    expect(Array.from(result[0]!)).toEqual([0x50, 0x4b, 0x03, 0x04, 1, 2]);
  });

  it("normalizes array-like Android bridge responses", async () => {
    const result = await readEpubBinaryCandidates({
      readBinary: async () => ({
        0: 0x50,
        1: 0x4b,
        2: 0x03,
        3: 0x04,
        4: 1,
        5: 2,
        length: 6,
      }),
    }, { path: "Books/example.epub", stat: { size: 6 } });

    expect(Array.from(result[0]!)).toEqual([0x50, 0x4b, 0x03, 0x04, 1, 2]);
  });

  it("retries after an incomplete first Android bridge read", async () => {
    let readCount = 0;
    const result = await readEpubBinaryCandidates({
      readBinary: async () => {
        readCount += 1;
        return readCount === 1 ? invalid : epub;
      },
    }, { path: "Books/example.epub", stat: { size: 6 } }, {
      retryDelaysMs: [0, 0],
      wait: async () => undefined,
    });

    expect(readCount).toBe(2);
    expect(result[0]?.byteLength).toBe(6);
  });

  it("rejects a ZIP-looking payload when archive validation fails", async () => {
    await expect(readEpubBinaryCandidates({
      readBinary: async () => epub,
    }, { path: "Books/example.epub", stat: { size: 6 } }, {
      retryDelaysMs: [0],
      validate: async () => false,
    })).rejects.toThrow("incomplete EPUB archive");
  });
});
