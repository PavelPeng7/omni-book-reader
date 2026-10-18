import { normalizePath } from "obsidian";
import type { FileManager, TAbstractFile, TFile, Vault } from "obsidian";
import { safeFileName } from "./media-utils";
import type {
  AnnotationDocuments,
  BookState,
  ExportTemplatePreset,
  HighlightColor,
  HighlightStyle,
  ReaderHighlight,
} from "./types";

const LEGACY_GENERATED_MARKER = "<!-- omni-book-reader:generated -->";

const COLOR_VALUES: Record<HighlightColor, string> = {
  yellow: "#FFD54F",
  green: "#81C784",
  blue: "#64B5F6",
  pink: "#F48FB1",
};

const STYLE_LABELS: Record<HighlightStyle, string> = {
  highlight: "高亮",
  underline: "下划线",
  strikethrough: "删除线",
  squiggly: "波浪线",
};

type AnnotationDocumentKind = "highlights" | "notes";

export interface AnnotationDocumentInput {
  outputFolder?: string;
  bookId?: string;
  sourceFile: TFile;
  state: BookState;
  title: string;
  author: string;
  exportTemplate?: ExportTemplatePreset;
  customExportTemplatePath?: string;
}

export interface AnnotationRenderOptions {
  bookId?: string;
  sourcePath?: string;
  vaultName?: string;
  preset?: ExportTemplatePreset;
  customTemplate?: string;
  exportedAt?: number;
}

function isFile(value: TAbstractFile | null): value is TFile {
  return Boolean(value && "extension" in value);
}

function dateStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function singleLine(value: string, fallback = ""): string {
  return value.replace(/\s+/g, " ").trim() || fallback;
}

function quote(value: string): string {
  return value.replace(/\r\n?/g, "\n").split("\n").map((line) => `> ${line}`).join("\n");
}

function tagText(highlight: ReaderHighlight): string {
  return highlight.tags.length ? `标签：${highlight.tags.join("、")}` : "";
}

function entryMetadata(highlight: ReaderHighlight, timestamp = highlight.createdAt): string {
  const values = [
    `Date: ${dateStamp(timestamp)}`,
    `Color: ${COLOR_VALUES[highlight.color]}`,
    `Style: ${STYLE_LABELS[highlight.style]}`,
  ];
  if (highlight.tags.length) values.push(`Tags: ${highlight.tags.join(", ")}`);
  return `*${values.join(" | ")}*`;
}

function sortedHighlights(highlights: ReaderHighlight[]): ReaderHighlight[] {
  return [...highlights].sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

export function buildCfiLink(vaultName: string, sourcePath: string, cfi: string, bookId?: string): string {
  const encode = (value: string): string => encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const params = [
    // `vault` is reserved by Obsidian and is resolved before custom protocol
    // handlers run. Keep the source Vault as plugin-owned metadata instead.
    vaultName ? `sourceVault=${encode(vaultName)}` : "",
    bookId ? `bookId=${encode(bookId)}` : `path=${encode(normalizePath(sourcePath))}`,
    `cfi=${encode(cfi)}`,
  ].filter(Boolean).join("&");
  return `obsidian://omni-book-reader?${params}`;
}

function sourceLink(highlight: ReaderHighlight, options: AnnotationRenderOptions): string {
  if (!options.sourcePath) return "";
  return `[回到原文](${buildCfiLink(options.vaultName ?? "", options.sourcePath, highlight.cfi, options.bookId)})`;
}

function renderClassicEntries(
  kind: AnnotationDocumentKind,
  highlights: ReaderHighlight[],
  options: AnnotationRenderOptions,
): string {
  if (!highlights.length) return kind === "notes" ? "_暂无笔记。_" : "_暂无高亮。_";
  const lines: string[] = [];
  for (const highlight of highlights) {
    const link = sourceLink(highlight, options);
    lines.push(`### ${singleLine(highlight.chapter, "未命名章节")}`, "", quote(highlight.text), "");
    if (kind === "notes") lines.push(`**Note:** ${highlight.note?.trim() ?? ""}`, "");
    if (link) lines.push(link, "");
    lines.push(entryMetadata(highlight, kind === "notes" ? highlight.noteUpdatedAt ?? highlight.createdAt : highlight.createdAt), "", "---", "");
  }
  return lines.join("\n").trimEnd();
}

function renderCompactEntries(
  kind: AnnotationDocumentKind,
  highlights: ReaderHighlight[],
  options: AnnotationRenderOptions,
): string {
  if (!highlights.length) return kind === "notes" ? "_暂无笔记。_" : "_暂无高亮。_";
  return highlights.map((highlight) => {
    const link = sourceLink(highlight, options);
    const excerpt = singleLine(highlight.text, "（空摘抄）");
    const lines = [`- **${singleLine(highlight.chapter, "未命名章节")}** — ${excerpt}${link ? ` · ${link}` : ""}`];
    if (kind === "notes") lines.push(`  - **笔记：** ${singleLine(highlight.note ?? "")}`);
    const tags = tagText(highlight);
    if (tags) lines.push(`  - ${tags}`);
    lines.push(`  - ${entryMetadata(highlight, kind === "notes" ? highlight.noteUpdatedAt ?? highlight.createdAt : highlight.createdAt)}`);
    return lines.join("\n");
  }).join("\n");
}

function renderCalloutEntries(
  kind: AnnotationDocumentKind,
  highlights: ReaderHighlight[],
  options: AnnotationRenderOptions,
): string {
  if (!highlights.length) return kind === "notes" ? "_暂无笔记。_" : "_暂无高亮。_";
  return highlights.map((highlight) => {
    const lines = [`> [!quote] ${singleLine(highlight.chapter, "未命名章节")}`];
    for (const line of highlight.text.replace(/\r\n?/g, "\n").split("\n")) lines.push(`> ${line}`);
    if (kind === "notes") lines.push(">", `> **笔记：** ${highlight.note?.trim() ?? ""}`);
    const details = [sourceLink(highlight, options), tagText(highlight)].filter(Boolean).join(" · ");
    if (details) lines.push(">", `> ${details}`);
    lines.push(">", `> ${entryMetadata(highlight, kind === "notes" ? highlight.noteUpdatedAt ?? highlight.createdAt : highlight.createdAt)}`);
    return lines.join("\n");
  }).join("\n\n");
}

function renderEntries(
  kind: AnnotationDocumentKind,
  highlights: ReaderHighlight[],
  options: AnnotationRenderOptions,
): string {
  const preset = options.preset ?? "classic";
  if (preset === "compact") return renderCompactEntries(kind, highlights, options);
  if (preset === "callout") return renderCalloutEntries(kind, highlights, options);
  return renderClassicEntries(kind, highlights, options);
}

function applyDocumentTemplate(template: string, variables: Record<string, string>): string {
  let output = template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => variables[key] ?? match);
  if (!/\{\{\s*entries\s*\}\}/.test(template)) output = `${output.trimEnd()}\n\n${variables.entries}`;
  return `${output.trim() || variables.entries}\n`;
}

function renderDocument(
  kind: AnnotationDocumentKind,
  title: string,
  author: string,
  highlights: ReaderHighlight[],
  options: AnnotationRenderOptions,
): string {
  const documentTitle = kind === "notes" ? "Omni Book Reader - Notes" : "Omni Book Reader - Highlights";
  const entries = renderEntries(kind, highlights, options);
  const normalizedAuthor = singleLine(author);
  const builtIn = [
    `# ${documentTitle}`,
    "",
    `## ${singleLine(title, "未命名书籍")}`,
    ...(normalizedAuthor ? ["", `*${normalizedAuthor}*`] : []),
    "",
    entries,
  ].join("\n");
  if (!options.customTemplate?.trim()) return `${builtIn.trimEnd()}\n`;
  return applyDocumentTemplate(options.customTemplate, {
    "document.title": documentTitle,
    "document.kind": kind,
    "book.title": singleLine(title, "未命名书籍"),
    "book.author": normalizedAuthor,
    "book.filePath": normalizePath(options.sourcePath ?? ""),
    "export.date": dateStamp(options.exportedAt ?? Date.now()),
    entries,
  });
}

export function renderHighlightDocument(
  title: string,
  author: string,
  highlights: ReaderHighlight[],
  options: AnnotationRenderOptions = {},
): string {
  return renderDocument("highlights", title, author, sortedHighlights(highlights), options);
}

export function renderNoteDocument(
  title: string,
  author: string,
  highlights: ReaderHighlight[],
  options: AnnotationRenderOptions = {},
): string {
  const notes = sortedHighlights(highlights).filter((highlight) => Boolean(highlight.note?.trim()));
  return renderDocument("notes", title, author, notes, options);
}

function managedStart(kind: AnnotationDocumentKind): string {
  return `<!-- omni-book-reader:${kind}:start -->`;
}

function managedEnd(kind: AnnotationDocumentKind): string {
  return `<!-- omni-book-reader:${kind}:end -->`;
}

export function mergeManagedDocument(existing: string, kind: AnnotationDocumentKind, generated: string): string {
  const start = managedStart(kind);
  const end = managedEnd(kind);
  const safeGenerated = generated.replace(/<!--\s*omni-book-reader:/gi, "&lt;!-- omni-book-reader:");
  const block = `${start}\n${safeGenerated.trim()}\n${end}`;
  const startIndex = existing.indexOf(start);
  const endIndex = startIndex >= 0 ? existing.indexOf(end, startIndex + start.length) : -1;
  const orphanEndIndex = existing.indexOf(end);
  if ((startIndex >= 0 && endIndex < 0) || (startIndex < 0 && orphanEndIndex >= 0)) {
    throw new Error(`标注文档中的 ${kind} 受控区块标记不完整，请修复或移除标记后重试`);
  }
  if (startIndex >= 0 && endIndex >= 0) {
    if (existing.indexOf(start, startIndex + start.length) >= 0 || existing.indexOf(end, endIndex + end.length) >= 0) {
      throw new Error(`标注文档中存在多个 ${kind} 受控区块，请只保留一组标记`);
    }
    const merged = `${existing.slice(0, startIndex)}${block}${existing.slice(endIndex + end.length)}`;
    return merged.endsWith("\n") ? merged : `${merged}\n`;
  }
  if (existing.trimStart().startsWith(LEGACY_GENERATED_MARKER)) return `${block}\n`;
  if (!existing.trim()) return `${block}\n`;
  return `${existing.trimEnd()}\n\n${block}\n`;
}

function parentPath(path: string): string {
  const normalized = normalizePath(path);
  const separator = normalized.lastIndexOf("/");
  return separator < 0 ? "" : normalized.slice(0, separator);
}

function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

function folderHash(sourceFile: TFile, attempt: number): string {
  const key = `${normalizePath(sourceFile.path)}:${attempt}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function readableFolderName(sourceFile: TFile, attempt: number): string {
  const title = safeFileName(sourceFile.basename, "书")
    .replace(/[\uD800-\uDBFF]$/, "")
    .replace(/^[. ]+|[. ]+$/g, "") || "书";
  let prefix = "";
  for (const character of title) {
    if (utf8Length(prefix + character) > 91) break;
    prefix += character;
  }
  return `${prefix.trimEnd().replace(/\.+$/g, "") || "书"}-${folderHash(sourceFile, attempt)}`;
}

function isPreviousShortFolder(sourceFile: TFile, folderName: string): boolean {
  const prefix = Array.from(safeFileName(sourceFile.basename, "书")).slice(0, 2).join("");
  if (!folderName.startsWith(prefix) || !/^[0-9a-z]{7}$/.test(folderName.slice(prefix.length))) return false;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (folderName === `${prefix}${folderHash(sourceFile, attempt)}`) return true;
  }
  return false;
}

function hasReadableNames(sourceFile: TFile, paths: AnnotationDocuments): boolean {
  const name = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
  const folderName = name(parentPath(paths.highlightPath));
  return name(paths.highlightPath) === "高亮.md" && name(paths.notePath) === "笔记.md"
    && !isPreviousShortFolder(sourceFile, folderName)
    && [folderName, name(parentPath(paths.notePath)), name(paths.highlightPath), name(paths.notePath)]
      .every((part) => utf8Length(part) < 100);
}

export class AnnotationDocumentService {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly vault: Vault, private readonly fileManager: Pick<FileManager, "renameFile">) {}

  sync(input: AnnotationDocumentInput): Promise<void> {
    const job = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        const previousPaths = input.state.annotationDocuments;
        const paths = input.outputFolder ? {
          highlightPath: `${input.outputFolder}/高亮.md`, notePath: `${input.outputFolder}/笔记.md`,
          createdDate: previousPaths?.createdDate || dateStamp(Date.now()),
        } : previousPaths && hasReadableNames(input.sourceFile, previousPaths)
          ? previousPaths
          : {
            ...this.createDocumentPaths(input.sourceFile),
            ...(previousPaths ? { createdDate: previousPaths.createdDate } : {}),
          };
        const preset = input.exportTemplate ?? "classic";
        const customTemplate = preset === "custom"
          ? await this.loadCustomTemplate(input.customExportTemplatePath, [paths, previousPaths])
          : "";
        if (!input.outputFolder && previousPaths && previousPaths !== paths) await this.moveDocuments(input.sourceFile, previousPaths, paths);
        input.state.annotationDocuments = paths;
        const options: AnnotationRenderOptions = {
          sourcePath: input.sourceFile.path,
          bookId: input.bookId,
          vaultName: this.vault.getName(),
          preset,
          ...(customTemplate ? { customTemplate } : {}),
        };
        const highlightMarkdown = renderHighlightDocument(input.title, input.author, input.state.highlights, options);
        const noteMarkdown = renderNoteDocument(input.title, input.author, input.state.highlights, options);
        await this.ensureFolder(parentPath(paths.highlightPath));
        await this.ensureFolder(parentPath(paths.notePath));
        await this.upsertManaged(paths.highlightPath, "highlights", highlightMarkdown);
        await this.upsertManaged(paths.notePath, "notes", noteMarkdown);
      });
    this.writeChain = job.catch(() => undefined);
    return job;
  }

  migrateDocumentPaths(sourceFile: TFile, state: BookState): Promise<boolean> {
    const job = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        const previous = state.annotationDocuments;
        if (!previous || hasReadableNames(sourceFile, previous)) return false;
        const next = { ...this.createDocumentPaths(sourceFile), createdDate: previous.createdDate };
        await this.moveDocuments(sourceFile, previous, next);
        state.annotationDocuments = next;
        return true;
      });
    this.writeChain = job.then(() => undefined, () => undefined);
    return job;
  }

  async flush(): Promise<void> {
    await this.writeChain;
  }

  migrateLegacyProtocolLinks(documents: Iterable<AnnotationDocuments | undefined>): Promise<void> {
    const paths = new Set<string>();
    for (const item of documents) {
      if (item?.highlightPath) paths.add(normalizePath(item.highlightPath));
      if (item?.notePath) paths.add(normalizePath(item.notePath));
    }
    const job = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        for (const path of paths) {
          const file = this.vault.getAbstractFileByPath(path);
          if (!isFile(file) || file.extension.toLowerCase() !== "md") continue;
          const current = await this.vault.cachedRead(file);
          const next = current.replaceAll(
            "obsidian://omni-book-reader?vault=",
            "obsidian://omni-book-reader?sourceVault=",
          );
          if (next !== current) await this.vault.modify(file, next);
        }
      });
    this.writeChain = job.catch(() => undefined);
    return job;
  }

  private async loadCustomTemplate(
    path: string | undefined,
    documents: (AnnotationDocuments | undefined)[],
  ): Promise<string> {
    const normalized = normalizePath(path?.trim() ?? "");
    if (!normalized) throw new Error("尚未设置自定义导出模板路径");
    if (documents.some((item) => item && (normalized === item.highlightPath || normalized === item.notePath))) {
      throw new Error("自定义模板不能使用当前书籍的导出文档");
    }
    const file = this.vault.getAbstractFileByPath(normalized);
    if (!isFile(file) || file.extension.toLowerCase() !== "md") throw new Error(`找不到自定义导出模板：${normalized}`);
    return this.vault.cachedRead(file);
  }

  private createDocumentPaths(sourceFile: TFile): AnnotationDocuments {
    const createdDate = dateStamp(Date.now());
    const sourceFolder = parentPath(sourceFile.path);
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const outputFolder = joinPath(sourceFolder, readableFolderName(sourceFile, attempt));
      if (!this.vault.getAbstractFileByPath(outputFolder)) {
        const highlightPath = joinPath(outputFolder, "高亮.md");
        const notePath = joinPath(outputFolder, "笔记.md");
        return { highlightPath, notePath, createdDate };
      }
    }
    throw new Error("无法为标注文档分配短目录名");
  }

  private async moveDocuments(sourceFile: TFile, previous: AnnotationDocuments, next: AnnotationDocuments): Promise<void> {
    const moves = [
      { from: previous.highlightPath, to: next.highlightPath },
      { from: previous.notePath, to: next.notePath },
    ];
    const oldFolderPath = parentPath(previous.highlightPath);
    const newFolderPath = parentPath(next.highlightPath);
    const oldFolder = this.vault.getAbstractFileByPath(oldFolderPath);
    const canMoveFolder = oldFolderPath === parentPath(previous.notePath)
      && (oldFolderPath === joinPath(parentPath(sourceFile.path), sourceFile.basename)
        || isPreviousShortFolder(sourceFile, oldFolderPath.slice(oldFolderPath.lastIndexOf("/") + 1)))
      && oldFolder && !isFile(oldFolder) && "children" in oldFolder
      && Array.isArray(oldFolder.children)
      && !oldFolder.children.some((child: TAbstractFile) => !moves.some((move) => move.from === child.path)
        && (child.name === "高亮.md" || child.name === "笔记.md"));
    if (canMoveFolder) {
      await this.fileManager.renameFile(oldFolder, newFolderPath);
      const renamed: { file: TFile; intermediatePath: string }[] = [];
      try {
        for (const move of moves) {
          const intermediatePath = joinPath(newFolderPath, move.from.slice(oldFolderPath.length + 1));
          const file = this.vault.getAbstractFileByPath(intermediatePath);
          if (!file) continue;
          if (!isFile(file)) throw new Error(`原标注文档路径不是文件：${intermediatePath}`);
          if (intermediatePath === move.to) continue;
          await this.fileManager.renameFile(file, move.to);
          renamed.push({ file, intermediatePath });
        }
      } catch (error) {
        for (const item of renamed.reverse()) await this.fileManager.renameFile(item.file, item.intermediatePath);
        await this.fileManager.renameFile(oldFolder, oldFolderPath);
        throw error;
      }
      return;
    }

    await this.ensureFolder(newFolderPath);
    const completed: { file: TFile; from: string }[] = [];
    try {
      for (const move of moves) {
        const file = this.vault.getAbstractFileByPath(move.from);
        if (!file) continue;
        if (!isFile(file)) throw new Error(`原标注文档路径不是文件：${move.from}`);
        if (this.vault.getAbstractFileByPath(move.to)) throw new Error(`短标注文档路径已被占用：${move.to}`);
        await this.fileManager.renameFile(file, move.to);
        completed.push({ file, from: move.from });
      }
    } catch (error) {
      for (const move of completed.reverse()) await this.fileManager.renameFile(move.file, move.from);
      throw error;
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!path) return;
    let current = "";
    for (const segment of normalizePath(path).split("/")) {
      current = joinPath(current, segment);
      const existing = this.vault.getAbstractFileByPath(current);
      if (isFile(existing)) throw new Error(`无法创建笔记目录，路径已被文件占用：${current}`);
      if (!existing) await this.vault.createFolder(current);
    }
  }

  private async upsertManaged(path: string, kind: AnnotationDocumentKind, generated: string): Promise<void> {
    const existing = this.vault.getAbstractFileByPath(path);
    if (isFile(existing)) {
      const current = await this.vault.cachedRead(existing);
      const next = mergeManagedDocument(current, kind, generated);
      if (next !== current) await this.vault.modify(existing, next);
      return;
    }
    if (existing) throw new Error(`无法写入标注文档，路径不是文件：${path}`);
    await this.vault.create(path, mergeManagedDocument("", kind, generated));
  }
}
