import type { FileManager, TFile, Vault } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import {
  AnnotationDocumentService,
  buildCfiLink,
  mergeManagedDocument,
  renderHighlightDocument,
  renderNoteDocument,
} from "../src/annotation-documents";
import type { BookState, ReaderHighlight } from "../src/types";

const createdAt = new Date(2026, 6, 19, 12, 0, 0).getTime();

function highlight(overrides: Partial<ReaderHighlight> = {}): ReaderHighlight {
  return {
    id: "highlight-1",
    cfi: "epubcfi(/6/2!/4/2:0)",
    text: "被高亮的原文",
    chapter: "第一章",
    color: "yellow",
    style: "highlight",
    tags: [],
    sectionIndex: 0,
    createdAt,
    ...overrides,
  };
}

describe("annotation documents", () => {
  it("renders separate highlight and note documents in the expected readable format", () => {
    const item = highlight({ note: "我的想法", noteUpdatedAt: createdAt, tags: ["原型"] });
    const options = { sourcePath: "书籍/测试书.epub", vaultName: "测试 Vault" };
    const highlights = renderHighlightDocument("测试书", "测试作者", [item], options);
    const notes = renderNoteDocument("测试书", "测试作者", [item], options);

    expect(highlights).toContain("# Omni Book Reader - Highlights");
    expect(highlights).toContain("### 第一章\n\n> 被高亮的原文");
    expect(highlights).not.toContain("我的想法");
    expect(notes).toContain("# Omni Book Reader - Notes");
    expect(notes).toContain("**Note:** 我的想法");
    expect(notes).toContain("Date: 2026-07-19 | Color: #FFD54F | Style: 高亮 | Tags: 原型");
    expect(notes).toContain("obsidian://omni-book-reader?sourceVault=");
    expect(notes).not.toMatch(/[?&]vault=/);
  });

  it("preserves manual text outside managed blocks and supports custom templates", () => {
    const generated = renderHighlightDocument("测试书", "作者", [highlight()], {
      sourcePath: "书籍/测试书.epub",
      vaultName: "Vault",
      customTemplate: "# {{book.title}}\n导出：{{export.date}}\n\n{{entries}}",
      exportedAt: createdAt,
    });
    const first = mergeManagedDocument("# 我的手写总结\n", "highlights", generated);
    const withManualSuffix = `${first}\n## 我的结论\n不会被插件覆盖\n`;
    const second = mergeManagedDocument(withManualSuffix, "highlights", generated.replace("被高亮的原文", "更新后的摘抄"));
    expect(second).toContain("# 我的手写总结");
    expect(second).toContain("更新后的摘抄");
    expect(second).toContain("## 我的结论\n不会被插件覆盖");
    expect(second).not.toContain("被高亮的原文");
    expect(second.match(/omni-book-reader:highlights:start/g)).toHaveLength(1);
    expect(generated).toContain("# 测试书");
    expect(generated).toContain("导出：2026-07-19");
    const cfiLink = buildCfiLink("Vault", "书籍/测试书.epub", highlight().cfi);
    expect(cfiLink).toContain("sourceVault=Vault");
    expect(cfiLink).not.toMatch(/[?&]vault=/);
    expect(cfiLink).toContain("cfi=epubcfi%28");
    expect(() => mergeManagedDocument("<!-- omni-book-reader:highlights:start -->\n损坏", "highlights", generated))
      .toThrow("受控区块标记不完整");
  });

  it("does not resolve a stale custom template path while an internal preset is selected", async () => {
    const entries = new Map<string, { path: string; extension?: string; content?: string }>();
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => entries.get(path) ?? null),
      createFolder: vi.fn(async (path: string) => { entries.set(path, { path }); }),
      create: vi.fn(async (path: string, content: string) => {
        entries.set(path, { path, extension: "md", content });
      }),
      modify: vi.fn(),
      cachedRead: vi.fn(),
      getName: vi.fn(() => "测试 Vault"),
    } as unknown as Vault;
    const service = new AnnotationDocumentService(vault, { renameFile: vi.fn() });
    const state: BookState = {
      sourceSignature: { size: 1, mtime: 1 },
      bookmarks: [],
      highlights: [highlight()],
    };

    await expect(service.sync({
      sourceFile: { path: "书籍/测试书.epub", basename: "测试书" } as TFile,
      state,
      title: "测试书",
      author: "测试作者",
      exportTemplate: "classic",
      customExportTemplatePath: "模板/已删除.md",
    })).resolves.toBeUndefined();
    expect(vault.cachedRead).not.toHaveBeenCalled();
  });

  it("creates and then maintains one document pair beside the EPUB", async () => {
    const entries = new Map<string, { path: string; extension?: string; content?: string }>();
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => entries.get(path) ?? null),
      createFolder: vi.fn(async (path: string) => { entries.set(path, { path }); }),
      create: vi.fn(async (path: string, content: string) => {
        const file = { path, extension: "md", content };
        entries.set(path, file);
        return file;
      }),
      modify: vi.fn(async (file: { path: string; content?: string }, content: string) => {
        file.content = content;
      }),
      cachedRead: vi.fn(async (file: { content?: string }) => file.content ?? ""),
      getName: vi.fn(() => "测试 Vault"),
    } as unknown as Vault;
    const state: BookState = {
      sourceSignature: { size: 1, mtime: 1 },
      bookmarks: [],
      highlights: [highlight()],
    };
    const service = new AnnotationDocumentService(vault, { renameFile: vi.fn() });
    const sourceFile = {
      path: "文献笔记/读书笔记/测试书.epub",
      basename: "测试书",
    } as TFile;

    entries.set("模板/导出.md", {
      path: "模板/导出.md",
      extension: "md",
      content: "# {{document.title}}\n\n书籍：{{book.title}}\n\n{{entries}}",
    });
    await service.sync({
      sourceFile,
      state,
      title: "测试书",
      author: "测试作者",
      exportTemplate: "custom",
      customExportTemplatePath: "模板/导出.md",
    });
    const paths = state.annotationDocuments;
    expect(paths?.highlightPath).toMatch(/^文献笔记\/读书笔记\/测试书-[0-9a-z]{7}\/高亮\.md$/);
    expect(paths?.notePath).toMatch(/^文献笔记\/读书笔记\/测试书-[0-9a-z]{7}\/笔记\.md$/);

    state.highlights[0]!.note = "后来添加的笔记";
    await service.sync({
      sourceFile,
      state,
      title: "测试书",
      author: "测试作者",
      exportTemplate: "custom",
      customExportTemplatePath: "模板/导出.md",
    });
    await service.sync({
      sourceFile,
      state,
      title: "测试书",
      author: "测试作者",
      exportTemplate: "custom",
      customExportTemplatePath: "模板/导出.md",
    });
    expect(vault.create).toHaveBeenCalledTimes(2);
    expect(vault.modify).toHaveBeenCalledTimes(1);
    expect(entries.get(paths!.notePath)?.content).toContain("**Note:** 后来添加的笔记");
    expect(entries.get(paths!.notePath)?.content).toContain("书籍：测试书");
    expect(entries.get(paths!.highlightPath)?.content).toContain("omni-book-reader:highlights:start");

    const highlightDocument = entries.get(paths!.highlightPath)!;
    highlightDocument.content = highlightDocument.content!.replace("?sourceVault=", "?vault=");
    await service.migrateLegacyProtocolLinks([paths]);
    expect(highlightDocument.content).toContain("?sourceVault=");
    expect(highlightDocument.content).not.toContain("?vault=");
  });

  it("moves existing long export paths without losing manual text", async () => {
    const title = "一段非常非常长的书名";
    const folder = `书籍/${title}`;
    const oldHighlightPath = `${folder}/${title}-Highlight-2026-07-19.md`;
    const oldNotePath = `${folder}/${title}-Note-2026-07-19.md`;
    const entries = new Map<string, { path: string; extension?: string; content?: string; children?: unknown[] }>();
    entries.set(folder, { path: folder, children: [] });
    entries.set(oldHighlightPath, {
      path: oldHighlightPath, extension: "md",
      content: mergeManagedDocument("# 手写高亮总结\n", "highlights", "旧摘抄"),
    });
    entries.set(oldNotePath, {
      path: oldNotePath, extension: "md",
      content: mergeManagedDocument("# 手写笔记总结\n", "notes", "旧笔记"),
    });
    entries.set(`${folder}/想法.md`, { path: `${folder}/想法.md`, extension: "md", content: "用户自己的文档" });
    entries.get(folder)!.children = [entries.get(oldHighlightPath)!, entries.get(oldNotePath)!, entries.get(`${folder}/想法.md`)!];
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => entries.get(path) ?? null),
      createFolder: vi.fn(async (path: string) => { entries.set(path, { path }); }),
      create: vi.fn(async (path: string, content: string) => { entries.set(path, { path, extension: "md", content }); }),
      modify: vi.fn(async (file: { content?: string }, content: string) => { file.content = content; }),
      cachedRead: vi.fn(async (file: { content?: string }) => file.content ?? ""),
      getName: vi.fn(() => "测试 Vault"),
    } as unknown as Vault;
    const fileManager = {
      renameFile: vi.fn(async (file: { path: string; children?: unknown[] }, nextPath: string) => {
        const oldPath = file.path;
        entries.delete(file.path);
        file.path = nextPath;
        entries.set(nextPath, file);
        if (file.children) {
          for (const child of file.children as { path: string }[]) {
            entries.delete(child.path);
            child.path = `${nextPath}${child.path.slice(oldPath.length)}`;
            entries.set(child.path, child);
          }
        }
      }),
    } as unknown as Pick<FileManager, "renameFile">;
    const state: BookState = {
      sourceSignature: { size: 1, mtime: 1 }, bookmarks: [], highlights: [highlight()],
      annotationDocuments: { highlightPath: oldHighlightPath, notePath: oldNotePath, createdDate: "2026-07-19" },
    };
    const sourceFile = { path: `书籍/${title}.epub`, basename: title } as TFile;
    const service = new AnnotationDocumentService(vault, fileManager);

    await expect(service.migrateDocumentPaths(sourceFile, state)).resolves.toBe(true);
    const paths = state.annotationDocuments!;
    const generatedFolder = paths.highlightPath.split("/").at(-2)!;
    expect(generatedFolder).toMatch(new RegExp(`^${title}-[0-9a-z]{7}$`));
    expect(new TextEncoder().encode(generatedFolder).length).toBeLessThan(100);
    expect(new TextEncoder().encode(paths.highlightPath.split("/").at(-1)!).length).toBeLessThan(100);
    expect(new TextEncoder().encode(paths.notePath.split("/").at(-1)!).length).toBeLessThan(100);
    expect(paths.createdDate).toBe("2026-07-19");
    expect(entries.has(oldHighlightPath)).toBe(false);
    expect(entries.has(oldNotePath)).toBe(false);
    expect(entries.has(folder)).toBe(false);
    expect(entries.get(paths.highlightPath)?.content).toContain("# 手写高亮总结");
    expect(entries.get(paths.notePath)?.content).toContain("# 手写笔记总结");
    expect(entries.get(`${paths.highlightPath.slice(0, paths.highlightPath.lastIndexOf("/"))}/想法.md`)?.content)
      .toBe("用户自己的文档");
    expect(fileManager.renameFile).toHaveBeenCalledTimes(3);

    await service.sync({ sourceFile, state, title, author: "作者" });
    await service.sync({ sourceFile, state, title, author: "作者" });
    await expect(service.migrateDocumentPaths(sourceFile, state)).resolves.toBe(false);
    expect(fileManager.renameFile).toHaveBeenCalledTimes(3);
    expect(vault.create).not.toHaveBeenCalled();
  });

  it("uses another short folder when the first candidate is occupied", async () => {
    const entries = new Map<string, { path: string; extension?: string; content?: string }>();
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => entries.get(path) ?? null),
      createFolder: vi.fn(async (path: string) => { entries.set(path, { path }); }),
      create: vi.fn(async (path: string, content: string) => { entries.set(path, { path, extension: "md", content }); }),
      getName: vi.fn(() => "测试 Vault"),
    } as unknown as Vault;
    const service = new AnnotationDocumentService(vault, { renameFile: vi.fn() });
    const sourceFile = { path: "书籍/很长很长的书名.epub", basename: "很长很长的书名" } as TFile;
    const first: BookState = { sourceSignature: { size: 1, mtime: 1 }, bookmarks: [], highlights: [highlight()] };
    const second: BookState = { sourceSignature: { size: 1, mtime: 1 }, bookmarks: [], highlights: [highlight()] };

    await service.sync({ sourceFile, state: first, title: sourceFile.basename, author: "作者" });
    const firstPath = first.annotationDocuments!.highlightPath;
    await service.sync({ sourceFile, state: second, title: sourceFile.basename, author: "作者" });
    expect(second.annotationDocuments!.highlightPath).not.toBe(firstPath);
    expect(new TextEncoder().encode(second.annotationDocuments!.highlightPath.split("/").at(-2)!).length).toBeLessThan(100);
    expect(entries.get(firstPath)?.content).toContain("omni-book-reader:highlights:start");
  });

  it("keeps a long Unicode book title recognizable within the byte limit", async () => {
    const title = "漫长书名📚".repeat(20);
    const entries = new Map<string, { path: string; extension?: string; content?: string }>();
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => entries.get(path) ?? null),
      createFolder: vi.fn(async (path: string) => { entries.set(path, { path }); }),
      create: vi.fn(async (path: string, content: string) => { entries.set(path, { path, extension: "md", content }); }),
      getName: vi.fn(() => "Vault"),
    } as unknown as Vault;
    const state: BookState = { sourceSignature: { size: 1, mtime: 1 }, bookmarks: [], highlights: [highlight()] };
    const service = new AnnotationDocumentService(vault, { renameFile: vi.fn() });

    await service.sync({ sourceFile: { path: `书籍/${title}.epub`, basename: title } as TFile, state, title, author: "作者" });
    const folderName = state.annotationDocuments!.highlightPath.split("/").at(-2)!;
    expect(folderName.startsWith("漫长书名📚漫长书名")).toBe(true);
    expect(folderName).toMatch(/-[0-9a-z]{7}$/);
    expect(new TextEncoder().encode(folderName).length).toBeLessThan(100);
    expect(new TextEncoder().encode(state.annotationDocuments!.highlightPath.split("/").at(-1)!).length)
      .toBeLessThan(100);
  });

  it("renames the previous two-character export folder to a readable title", async () => {
    const title = "从前只有两个字的书名";
    const sourcePath = `书籍/${title}.epub`;
    let hash = 2166136261;
    for (const character of `${sourcePath}:0`) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    }
    const oldFolder = `书籍/从前${hash.toString(36).padStart(7, "0")}`;
    const highlightPath = `${oldFolder}/高亮.md`;
    const notePath = `${oldFolder}/笔记.md`;
    const entries = new Map<string, { path: string; name?: string; extension?: string; content?: string; children?: unknown[] }>([
      [highlightPath, { path: highlightPath, name: "高亮.md", extension: "md", content: "手写高亮" }],
      [notePath, { path: notePath, name: "笔记.md", extension: "md", content: "手写笔记" }],
    ]);
    entries.set(oldFolder, { path: oldFolder, children: [entries.get(highlightPath)!, entries.get(notePath)!] });
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => entries.get(path) ?? null),
      createFolder: vi.fn(),
      getName: vi.fn(() => "Vault"),
    } as unknown as Vault;
    const fileManager = {
      renameFile: vi.fn(async (file: { path: string; children?: unknown[] }, nextPath: string) => {
        const previousPath = file.path;
        entries.delete(previousPath);
        file.path = nextPath;
        entries.set(nextPath, file);
        for (const child of file.children ?? [] as { path: string }[]) {
          const item = child as { path: string };
          entries.delete(item.path);
          item.path = `${nextPath}${item.path.slice(previousPath.length)}`;
          entries.set(item.path, item);
        }
      }),
    } as unknown as Pick<FileManager, "renameFile">;
    const state: BookState = {
      sourceSignature: { size: 1, mtime: 1 }, bookmarks: [], highlights: [highlight()],
      annotationDocuments: { highlightPath, notePath, createdDate: "2026-07-19" },
    };
    const service = new AnnotationDocumentService(vault, fileManager);

    await expect(service.migrateDocumentPaths({ path: sourcePath, basename: title } as TFile, state)).resolves.toBe(true);
    expect(state.annotationDocuments!.highlightPath).toMatch(/^书籍\/从前只有两个字的书名-[0-9a-z]{7}\/高亮\.md$/);
    expect(entries.get(state.annotationDocuments!.highlightPath)?.content).toBe("手写高亮");
    expect(entries.get(state.annotationDocuments!.notePath)?.content).toBe("手写笔记");
    expect(entries.has(oldFolder)).toBe(false);
    expect(fileManager.renameFile).toHaveBeenCalledTimes(1);
  });

  it("keeps a user file when its name conflicts with a short export filename", async () => {
    const title = "有很长名称的书";
    const folder = `书籍/${title}`;
    const oldHighlightPath = `${folder}/${title}-Highlight-2026-07-19.md`;
    const oldNotePath = `${folder}/${title}-Note-2026-07-19.md`;
    const conflictPath = `${folder}/高亮.md`;
    const entries = new Map<string, { path: string; name?: string; extension?: string; content?: string; children?: unknown[] }>([
      [oldHighlightPath, { path: oldHighlightPath, name: `${title}-Highlight-2026-07-19.md`, extension: "md", content: "旧高亮" }],
      [oldNotePath, { path: oldNotePath, name: `${title}-Note-2026-07-19.md`, extension: "md", content: "旧笔记" }],
      [conflictPath, { path: conflictPath, name: "高亮.md", extension: "md", content: "用户自己的高亮" }],
    ]);
    entries.set(folder, { path: folder, children: [entries.get(oldHighlightPath)!, entries.get(oldNotePath)!, entries.get(conflictPath)!] });
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => entries.get(path) ?? null),
      createFolder: vi.fn(async (path: string) => { entries.set(path, { path }); }),
      getName: vi.fn(() => "测试 Vault"),
    } as unknown as Vault;
    const fileManager = {
      renameFile: vi.fn(async (file: { path: string }, nextPath: string) => {
        entries.delete(file.path);
        file.path = nextPath;
        entries.set(nextPath, file);
      }),
    } as unknown as Pick<FileManager, "renameFile">;
    const state: BookState = {
      sourceSignature: { size: 1, mtime: 1 }, bookmarks: [], highlights: [highlight()],
      annotationDocuments: { highlightPath: oldHighlightPath, notePath: oldNotePath, createdDate: "2026-07-19" },
    };
    const service = new AnnotationDocumentService(vault, fileManager);

    await expect(service.migrateDocumentPaths(
      { path: `书籍/${title}.epub`, basename: title } as TFile, state,
    )).resolves.toBe(true);
    expect(entries.get(conflictPath)?.content).toBe("用户自己的高亮");
    expect(entries.has(folder)).toBe(true);
    expect(entries.get(state.annotationDocuments!.highlightPath)?.content).toBe("旧高亮");
    expect(entries.get(state.annotationDocuments!.notePath)?.content).toBe("旧笔记");
    expect(fileManager.renameFile).toHaveBeenCalledTimes(2);
  });

  it("rolls back the first move if the second legacy document cannot move", async () => {
    const title = "一本名称特别长的书";
    const folder = `书籍/${title}`;
    const highlightPath = `${folder}/${title}-Highlight-2026-07-19.md`;
    const notePath = `${folder}/${title}-Note-2026-07-19.md`;
    const entries = new Map<string, { path: string; extension?: string; content?: string; children?: unknown[] }>([
      [highlightPath, { path: highlightPath, extension: "md", content: "手写高亮" }],
      [notePath, { path: notePath, extension: "md", content: "手写笔记" }],
    ]);
    entries.set(folder, { path: folder, children: [entries.get(highlightPath)!, entries.get(notePath)!] });
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => entries.get(path) ?? null),
      createFolder: vi.fn(async (path: string) => { entries.set(path, { path }); }),
      getName: vi.fn(() => "测试 Vault"),
    } as unknown as Vault;
    const fileManager = {
      renameFile: vi.fn(async (file: { path: string; children?: unknown[] }, nextPath: string) => {
        if (file.path.endsWith("-Note-2026-07-19.md")) throw new Error("move failed");
        const oldPath = file.path;
        entries.delete(file.path);
        file.path = nextPath;
        entries.set(nextPath, file);
        if (file.children) {
          for (const child of file.children as { path: string }[]) {
            entries.delete(child.path);
            child.path = `${nextPath}${child.path.slice(oldPath.length)}`;
            entries.set(child.path, child);
          }
        }
      }),
    } as unknown as Pick<FileManager, "renameFile">;
    const state: BookState = {
      sourceSignature: { size: 1, mtime: 1 }, bookmarks: [], highlights: [highlight()],
      annotationDocuments: { highlightPath, notePath, createdDate: "2026-07-19" },
    };
    const service = new AnnotationDocumentService(vault, fileManager);

    await expect(service.sync({
      sourceFile: { path: `书籍/${title}.epub`, basename: title } as TFile,
      state, title, author: "作者",
    })).rejects.toThrow("move failed");
    expect(state.annotationDocuments).toEqual({ highlightPath, notePath, createdDate: "2026-07-19" });
    expect(entries.get(highlightPath)?.content).toBe("手写高亮");
    expect(entries.get(notePath)?.content).toBe("手写笔记");
    expect(entries.has(folder)).toBe(true);
    expect(fileManager.renameFile).toHaveBeenCalledTimes(5);
  });
});
