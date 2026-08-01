import { normalizePath } from "obsidian";

export function normalizeVaultPath(path: string): string {
  return normalizePath(String(path ?? "").trim());
}

export function isValidCfi(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 10 || value.length > 20000) return false;
  return /^epubcfi\([\s\S]+\)$/.test(value.trim());
}

export function createId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatLanguageValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(formatLanguageValue).filter(Boolean).join("、");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("name" in record) return formatLanguageValue(record.name);
    for (const candidate of Object.values(record)) {
      const formatted = formatLanguageValue(candidate);
      if (formatted) return formatted;
    }
  }
  return "";
}

export function excerptToText(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return [record.pre, record.match, record.post]
    .filter((part): part is string => typeof part === "string")
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as { matches?: (selector: string) => boolean; closest?: (selector: string) => Element | null } | null;
  if (typeof element?.matches !== "function") return false;
  return element.matches("input, textarea, select, [contenteditable='true']")
    || Boolean(element.closest?.("[contenteditable='true']"));
}
