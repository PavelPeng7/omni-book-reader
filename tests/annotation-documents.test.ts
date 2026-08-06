import type { TFile, Vault } from "obsidian";
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

    expect(highlights).toContain("# Omni Reader - Highlights");
    expect(highlights).toContain("### 第一章\n\n> 被高亮的原文");
    expect(highlights).not.toContain("我的想法");
    expect(notes).toContain("# Omni Reader - Notes");
    expect(notes).toContain("**Note:** 我的想法");
    expect(notes).toContain("Date: 2026-07-19 | Color: #FFD54F | Style: 高亮 | Tags: 原型");
    expect(notes).toContain("obsidian://pavel-epub-reader?sourceVault=");
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
    expect(second.match(/pavel-epub-reader:highlights:start/g)).toHaveLength(1);
    expect(generated).toContain("# 测试书");
    expect(generated).toContain("导出：2026-07-19");
    const cfiLink = buildCfiLink("Vault", "书籍/测试书.epub", highlight().cfi);
    expect(cfiLink).toContain("sourceVault=Vault");
    expect(cfiLink).not.toMatch(/[?&]vault=/);
    expect(cfiLink).toContain("cfi=epubcfi%28");
    expect(() => mergeManagedDocument("<!-- pavel-epub-reader:highlights:start -->\n损坏", "highlights", generated))
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
    const service = new AnnotationDocumentService(vault);
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
    const service = new AnnotationDocumentService(vault);
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
    expect(paths?.highlightPath).toMatch(/^文献笔记\/读书笔记\/测试书\/测试书-Highlight-\d{4}-\d{2}-\d{2}\.md$/);
    expect(paths?.notePath).toMatch(/^文献笔记\/读书笔记\/测试书\/测试书-Note-\d{4}-\d{2}-\d{2}\.md$/);

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
    expect(entries.get(paths!.highlightPath)?.content).toContain("pavel-epub-reader:highlights:start");

    const highlightDocument = entries.get(paths!.highlightPath)!;
    highlightDocument.content = highlightDocument.content!.replace("?sourceVault=", "?vault=");
    await service.migrateLegacyProtocolLinks([paths]);
    expect(highlightDocument.content).toContain("?sourceVault=");
    expect(highlightDocument.content).not.toContain("?vault=");
  });
});
