import type { TFile, Vault } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { exportChapterMarkdown } from "../src/chapter-export";

describe("chapter export", () => {
  it("exports safe chapter Markdown and preserves manual text on refresh", async () => {
    const entries = new Map<string, { path: string; extension?: string; content?: string }>();
    const vault = {
      getAbstractFileByPath: vi.fn((path: string) => entries.get(path) ?? null),
      createFolder: vi.fn(async (path: string) => { entries.set(path, { path }); }),
      create: vi.fn(async (path: string, content: string) => {
        entries.set(path, { path, extension: "md", content });
      }),
      read: vi.fn(async (file: { content?: string }) => file.content ?? ""),
      modify: vi.fn(async (file: { content?: string }, content: string) => { file.content = content; }),
    } as unknown as Vault;
    const sourceFile = {
      path: "Books/Test.epub",
      basename: "Test",
      parent: { path: "Books" },
    } as TFile;
    const doc = document.implementation.createHTMLDocument("chapter");
    doc.body.innerHTML = "<h1>标题</h1><p>正文 <strong>重点</strong></p><script>alert(1)</script>";

    const path = await exportChapterMarkdown({
      vault,
      sourceFile,
      document: doc,
      sectionIndex: 0,
      chapter: "第一章",
      bookTitle: "测试书",
      author: "作者",
      vaultName: "Vault",
      highlights: [],
    });
    const exported = entries.get(path)!;
    expect(exported.content).toContain("# 第一章");
    expect(exported.content).toContain("正文 **重点**");
    expect(exported.content).not.toContain("alert(1)");

    exported.content += "\n我的章节总结\n";
    doc.body.innerHTML = "<p>更新正文</p>";
    await exportChapterMarkdown({
      vault,
      sourceFile,
      document: doc,
      sectionIndex: 0,
      chapter: "第一章",
      bookTitle: "测试书",
      author: "作者",
      vaultName: "Vault",
      highlights: [],
    });
    expect(exported.content).toContain("更新正文");
    expect(exported.content).toContain("我的章节总结");
  });
});
