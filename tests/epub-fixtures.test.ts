import { File } from "node:buffer";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeBook } from "foliate-js/view.js";
import { extractEpubCover } from "../src/epub-cover";

const fixtureVault = process.env.OMNIREADER_E2E_VAULT;
const integrationDescribe = fixtureVault ? describe : describe.skip;

integrationDescribe("vault EPUB fixtures", () => {
  it("parses the existing EPUB 2 and EPUB 3 books", async () => {
    const vault = path.resolve(fixtureVault!);
    const entries = (await readdir(vault, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".epub"));
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const summaries: Array<{ title: string; sections: number; toc: number }> = [];
    let largestFixture: { bytes: Buffer; name: string } | null = null;
    for (const entry of entries) {
      const bytes = await readFile(path.join(entry.parentPath, entry.name));
      if (!largestFixture || bytes.length > largestFixture.bytes.length) {
        largestFixture = { bytes, name: entry.name };
      }
      const book = await makeBook(new File([bytes], entry.name, { type: "application/epub+zip" }));
      summaries.push({
        title: typeof book.metadata?.title === "string" ? book.metadata.title : "",
        sections: book.sections?.length ?? 0,
        toc: book.toc?.length ?? 0,
      });
      book.sections?.forEach((section: { unload?: () => void }) => section.unload?.());
      book.destroy?.();
    }

    expect(summaries.some((book) => book.sections === 41 && book.title.includes("永恒少年"))).toBe(true);
    expect(summaries.every((book) => book.sections > 0)).toBe(true);
    expect(summaries.every((book) => book.toc > 0)).toBe(true);

    expect(largestFixture).not.toBeNull();
    const coverSource = new File([largestFixture!.bytes], largestFixture!.name, {
      type: "application/epub+zip",
    }) as unknown as globalThis.File;
    const cover = await extractEpubCover(coverSource);
    expect(cover).not.toBeNull();
    expect(cover!.size).toBeGreaterThan(1000);
    expect(cover!.type).toMatch(/^image\//);
  }, 30000);
});
