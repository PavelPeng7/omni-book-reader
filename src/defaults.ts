import type { ReaderData, ReaderSettings } from "./types";

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "auto",
  layout: "paginated",
  font: "obsidian",
  fontSizePercent: 100,
  lineHeight: 1.7,
  letterSpacing: 0.01,
  paragraphSpacing: 0.65,
  widthMode: "standard",
  contentWidth: 720,
  pageMargin: 48,
  exportTemplate: "classic",
  customExportTemplatePath: "",
};

const themes = new Set(["auto", "light", "dark", "sepia"]);
const layouts = new Set(["paginated", "scrolled"]);
const fonts = new Set(["obsidian", "publisher", "serif", "sans"]);
const widthModes = new Set(["standard", "wide", "full", "edge"]);
const exportTemplates = new Set(["classic", "compact", "callout", "custom"]);

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export function normalizeSettings(value: unknown): ReaderSettings {
  const input = value && typeof value === "object" ? value as Partial<ReaderSettings> : {};
  return {
    theme: themes.has(String(input.theme)) ? input.theme as ReaderSettings["theme"] : DEFAULT_SETTINGS.theme,
    layout: layouts.has(String(input.layout)) ? input.layout as ReaderSettings["layout"] : DEFAULT_SETTINGS.layout,
    font: fonts.has(String(input.font)) ? input.font as ReaderSettings["font"] : DEFAULT_SETTINGS.font,
    fontSizePercent: Math.round(clamp(input.fontSizePercent, 80, 180, DEFAULT_SETTINGS.fontSizePercent)),
    lineHeight: Math.round(clamp(input.lineHeight, 1.2, 2.2, DEFAULT_SETTINGS.lineHeight) * 10) / 10,
    letterSpacing: Math.round(clamp(input.letterSpacing, -0.02, 0.12, DEFAULT_SETTINGS.letterSpacing) * 100) / 100,
    paragraphSpacing: Math.round(clamp(input.paragraphSpacing, 0, 1.2, DEFAULT_SETTINGS.paragraphSpacing) * 20) / 20,
    widthMode: widthModes.has(String(input.widthMode))
      ? input.widthMode as ReaderSettings["widthMode"]
      : DEFAULT_SETTINGS.widthMode,
    contentWidth: Math.round(clamp(input.contentWidth, 480, 1200, DEFAULT_SETTINGS.contentWidth)),
    pageMargin: Math.round(clamp(input.pageMargin, 0, 80, DEFAULT_SETTINGS.pageMargin)),
    exportTemplate: exportTemplates.has(String(input.exportTemplate))
      ? input.exportTemplate as ReaderSettings["exportTemplate"]
      : DEFAULT_SETTINGS.exportTemplate,
    customExportTemplatePath: typeof input.customExportTemplatePath === "string"
      ? input.customExportTemplatePath.replace(/\\/g, "/").trim().slice(0, 1000)
      : DEFAULT_SETTINGS.customExportTemplatePath,
  };
}

export function createDefaultData(): ReaderData {
  return {
    schemaVersion: 5,
    settings: { ...DEFAULT_SETTINGS },
    books: {},
  };
}
