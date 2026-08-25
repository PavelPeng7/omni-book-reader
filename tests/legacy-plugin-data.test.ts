import { describe, expect, it } from "vitest";
import { loadLegacyPluginData, type LegacyDataAdapter } from "../src/legacy-plugin-data";

class MemoryVaultAdapter implements LegacyDataAdapter {
  constructor(private readonly files: Record<string, string>) {}

  async exists(path: string): Promise<boolean> {
    return Object.hasOwn(this.files, path);
  }

  async list(): Promise<{ files: string[]; folders: string[] }> {
    return {
      files: [],
      folders: [
        ".obsidian/plugins/omni-book-reader",
        ".obsidian/plugins/omni-reader",
        ".obsidian/plugins/unrelated",
        ".obsidian/plugins/broken-copy",
      ],
    };
  }

  async read(path: string): Promise<string> {
    const value = this.files[path];
    if (value === undefined) throw new Error(`Missing file: ${path}`);
    return value;
  }
}

describe("legacy plugin data recovery", () => {
  it("loads data only from other folders with the same plugin id", async () => {
    const adapter = new MemoryVaultAdapter({
      ".obsidian/plugins/omni-reader/manifest.json": JSON.stringify({ id: "omni-book-reader" }),
      ".obsidian/plugins/omni-reader/data.json": JSON.stringify({ books: { legacy: {} } }),
      ".obsidian/plugins/unrelated/manifest.json": JSON.stringify({ id: "other-plugin" }),
      ".obsidian/plugins/unrelated/data.json": JSON.stringify({ books: { unrelated: {} } }),
      ".obsidian/plugins/broken-copy/manifest.json": "not json",
    });

    const results = await loadLegacyPluginData(
      adapter,
      ".obsidian/plugins",
      ".obsidian/plugins/omni-book-reader",
      "omni-book-reader",
    );

    expect(results).toEqual([{
      path: ".obsidian/plugins/omni-reader/data.json",
      value: { books: { legacy: {} } },
    }]);
  });
});
