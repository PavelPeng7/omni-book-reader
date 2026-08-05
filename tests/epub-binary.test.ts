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
    }, { path: "Books/example.epub", stat: { size: 4 } })).rejects.toThrow("valid EPUB ZIP payload");
  });
});
