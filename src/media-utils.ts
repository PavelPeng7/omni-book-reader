import { normalizePath } from "obsidian";
import type { TAbstractFile, TFile, Vault } from "obsidian";

function isFile(value: TAbstractFile | null): value is TFile {
  return Boolean(value && "extension" in value);
}

export function safeFileName(value: string, fallback = "未命名"): string {
  const result = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  return (result || fallback).slice(0, 120);
}

export async function ensureVaultFolder(vault: Vault, path: string): Promise<void> {
  let current = "";
  for (const part of normalizePath(path).split("/").filter(Boolean)) {
    current = normalizePath([current, part].filter(Boolean).join("/"));
    const existing = vault.getAbstractFileByPath(current);
    if (isFile(existing)) throw new Error(`目录路径已被文件占用：${current}`);
    if (!existing) await vault.createFolder(current);
  }
}

export async function sourceToBlob(source: string): Promise<Blob> {
  if (!source.startsWith("blob:") && !source.startsWith("data:")) {
    throw new Error("只允许读取书内 Blob/Data 图片");
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error(`读取图片失败：${response.status}`);
  return response.blob();
}

export function extensionForBlob(blob: Blob, source = ""): string {
  const byType: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/avif": "avif",
  };
  const known = byType[blob.type.toLowerCase()];
  if (known) return known;
  const match = source.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
  return match?.[1]?.toLowerCase() ?? "png";
}

export async function saveBlobToVault(vault: Vault, path: string, blob: Blob): Promise<void> {
  await ensureVaultFolder(vault, path.split("/").slice(0, -1).join("/"));
  const existing = vault.getAbstractFileByPath(path);
  const data = await blob.arrayBuffer();
  if (isFile(existing)) await vault.modifyBinary(existing, data);
  else if (existing) throw new Error(`图片目标路径不是文件：${path}`);
  else await vault.createBinary(path, data);
}

export async function copyImageBlob(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("当前平台不支持复制图片到剪贴板");
  }
  let output = blob;
  if (blob.type !== "image/png") {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    bitmap.close();
    output = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("图片转换失败")),
      "image/png",
    ));
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": output })]);
}
