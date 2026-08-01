import { normalizePath } from "obsidian";
import type { TAbstractFile, TFile, Vault } from "obsidian";
import { buildCfiLink } from "./annotation-documents";
import { ensureVaultFolder, extensionForBlob, safeFileName, saveBlobToVault, sourceToBlob } from "./media-utils";
import type { ReaderHighlight } from "./types";

const START = "<!-- pavel-epub-reader:chapter:start -->";
const END = "<!-- pavel-epub-reader:chapter:end -->";

function isFile(value: TAbstractFile | null): value is TFile {
  return Boolean(value && "extension" in value);
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>])/g, "\\$1");
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeMarkdown(node.textContent ?? "");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as Element;
  const content = Array.from(element.childNodes).map(inline).join("");
  if (element.matches("strong,b")) return `**${content}**`;
  if (element.matches("em,i")) return `*${content}*`;
  if (element.matches("code")) return `\`${content.replace(/`/g, "\\`")}\``;
  if (element.matches("br")) return "  \n";
  if (element.matches("a")) return content;
  return content;
}

async function block(node: Element, imagePath: (image: Element) => Promise<string>): Promise<string> {
  if (node.matches("script,style,iframe,object,embed,form,nav")) return "";
  if (node.matches("img")) {
    const path = await imagePath(node);
    return path ? `![${escapeMarkdown(node.getAttribute("alt") || "书内图片")}](${encodeURI(path)})\n\n` : "";
  }
  const children = async (): Promise<string> => {
    let output = "";
    for (const child of Array.from(node.children)) output += await block(child, imagePath);
    return output;
  };
  if (/^H[1-6]$/.test(node.tagName)) return `${"#".repeat(Number(node.tagName[1]))} ${inline(node).trim()}\n\n`;
  if (node.matches("p")) return `${inline(node).trim()}\n\n`;
  if (node.matches("blockquote")) return `${inline(node).trim().split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
  if (node.matches("pre")) return `\`\`\`\n${node.textContent?.trim() ?? ""}\n\`\`\`\n\n`;
  if (node.matches("li")) return `- ${inline(node).trim()}\n`;
  if (node.matches("hr")) return "---\n\n";
  return children();
}

function merge(existing: string, generated: string): string {
  const blockText = `${START}\n${generated.trim()}\n${END}`;
  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && (end < start || existing.indexOf(START, start + START.length) >= 0))) {
    throw new Error("章节导出文档的受控区块标记异常");
  }
  if (start >= 0) return `${existing.slice(0, start)}${blockText}${existing.slice(end + END.length)}`;
  return existing.trim() ? `${existing.trimEnd()}\n\n${blockText}\n` : `${blockText}\n`;
}

export interface ChapterExportInput {
  vault: Vault;
  sourceFile: TFile;
  document: Document;
  sectionIndex: number;
  chapter: string;
  bookTitle: string;
  author: string;
  vaultName: string;
  highlights: ReaderHighlight[];
}

export async function exportChapterMarkdown(input: ChapterExportInput): Promise<string> {
  const parent = input.sourceFile.parent?.path ?? "";
  const folder = normalizePath(`${parent}/${input.sourceFile.basename}/章节导出`);
  const chapterName = safeFileName(input.chapter, `章节-${input.sectionIndex + 1}`);
  const assetFolder = normalizePath(`${folder}/assets`);
  await ensureVaultFolder(input.vault, assetFolder);
  let imageIndex = 0;
  const imagePath = async (image: Element): Promise<string> => {
    const imageElement = image as HTMLImageElement;
    const source = imageElement.currentSrc || imageElement.src || image.getAttribute("src") || "";
    if (!source) return "";
    const blob = await sourceToBlob(source);
    imageIndex += 1;
    const filename = `${chapterName}-${imageIndex}.${extensionForBlob(blob, source)}`;
    const path = normalizePath(`${assetFolder}/${filename}`);
    await saveBlobToVault(input.vault, path, blob);
    return path;
  };
  let body = "";
  for (const child of Array.from(input.document.body.children)) body += await block(child, imagePath);
  const annotations = input.highlights
    .filter((item) => item.sectionIndex === input.sectionIndex)
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((item) => {
      const link = buildCfiLink(input.vaultName, input.sourceFile.path, item.cfi);
      return `> ${item.text.replace(/\r?\n/g, "\n> ")}\n\n${item.note ? `笔记：${item.note}\n\n` : ""}[回到原文](${link})`;
    }).join("\n\n---\n\n");
  const generated = [
    `# ${input.chapter}`,
    `书籍：[[${input.sourceFile.path}]]${input.author ? `  \n作者：${input.author}` : ""}`,
    body.trim(),
    annotations ? `## 当前章节标注\n\n${annotations}` : "",
  ].filter(Boolean).join("\n\n");
  const outputPath = normalizePath(`${folder}/${chapterName}.md`);
  const existing = input.vault.getAbstractFileByPath(outputPath);
  if (isFile(existing)) {
    const current = await input.vault.read(existing);
    const next = merge(current, generated);
    if (next !== current) await input.vault.modify(existing, next);
  } else if (existing) throw new Error(`章节导出路径不是文件：${outputPath}`);
  else await input.vault.create(outputPath, merge("", generated));
  return outputPath;
}
