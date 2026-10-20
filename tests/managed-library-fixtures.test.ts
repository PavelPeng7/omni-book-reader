import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FileManager, TFile, Vault } from "obsidian";
import { ManagedLibrary } from "../src/managed-library";

const fixtureRoot = process.env.OMNI_BOOK_READER_LIBRARY_FIXTURE;

(fixtureRoot ? describe : describe.skip)("existing managed library (read only)", () => {
  it("has one installed manifest for the reader plugin ID", async () => {
    const root = path.resolve(fixtureRoot!);
    const pluginRoot = path.join(root, ".obsidian/plugins");
    const matches: string[] = [];
    for (const folder of await readdir(pluginRoot, { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      let raw: string;
      try { raw = await readFile(path.join(pluginRoot, folder.name, "manifest.json"), "utf8"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      const manifest = JSON.parse(raw) as { id?: string };
      if (manifest.id === "omni-book-reader") matches.push(folder.name);
    }
    expect(matches, "Duplicate IDs overwrite each other during Obsidian manifest discovery").toHaveLength(1);
  });

  it("loads all book documents and resolves their local resources", async () => {
    const root = path.resolve(fixtureRoot!);
    const entries = new Map<string, Record<string, unknown>>();
    async function scan(folder: string): Promise<void> {
      const children: Array<Record<string, unknown> | undefined> = [];
      const entry = { path: folder, name: path.basename(folder), children };
      entries.set(folder, entry);
      for (const item of await readdir(path.join(root, folder), { withFileTypes: true })) {
        const childPath = `${folder}/${item.name}`;
        if (item.isDirectory()) await scan(childPath);
        else entries.set(childPath, {
          path: childPath, name: item.name, extension: path.extname(item.name).slice(1),
          parent: entry, stat: await stat(path.join(root, childPath)),
        });
        children.push(entries.get(childPath));
      }
    }
    await scan("My Reader");
    const vault = {
      configDir: ".obsidian",
      getAbstractFileByPath: (name: string) => entries.get(name) ?? null,
      getFiles: () => [...entries.values()].filter((item) => "extension" in item),
      read: (file: TFile) => readFile(path.join(root, file.path), "utf8"),
    } as unknown as Vault;
    const library = new ManagedLibrary(vault, {} as FileManager, {
      loadData: async () => ({ version: 1, root: "My Reader" }),
      saveData: async () => {},
    });
    const data = await library.loadData();
    expect(library.problems).toEqual([]);
    expect(Object.keys(data.books)).toHaveLength(vault.getFiles().filter((f) => f.name === "book.json").length);
    expect(library.filesList.length).toBeGreaterThan(0);
    for (const state of Object.values(data.books)) {
      if (state.customCoverPath) expect(entries.has(state.customCoverPath)).toBe(true);
      for (const resource of [state.annotationDocuments?.highlightPath, state.annotationDocuments?.notePath]) {
        if (resource) expect(entries.has(resource)).toBe(true);
      }
    }
    await library.discover();
    expect(library.problems).toEqual([]);
  });
});
