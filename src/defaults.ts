import type { ReaderData, ReaderSettings } from "./types";

export const DEFAULT_SETTINGS: ReaderSettings = {
  interfaceLanguage: "zh",
  theme: "auto",
  layout: "paginated",
  tapToTurnPages: true,
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
  bookshelfDisplayMode: "grid",
  bookshelfFilter: "all",
  bookshelfSort: "recent",
  lastSidebarTab: "toc",
  readerChromeAutoHide: true,
  readingPreset: "comfortable",
  defaultHighlightColor: "yellow",
  defaultHighlightStyle: "highlight",
  connectAdjacentHighlights: true,
  interfaceDensity: "comfortable",
  hasSeenReaderTutorial: false,
};

const themes = new Set(["auto", "light", "dark", "sepia"]);
const layouts = new Set(["paginated", "scrolled"]);
const fonts = new Set(["obsidian", "publisher", "serif", "sans"]);
const widthModes = new Set(["standard", "wide", "full", "edge"]);
const exportTemplates = new Set(["classic", "compact", "callout", "custom"]);
const interfaceLanguages = new Set(["zh", "en"]);
const bookshelfDisplayModes = new Set(["list", "grid", "covers"]);
const bookshelfFilters = new Set(["all", "reading", "finished", "reading-list"]);
const bookshelfSorts = new Set(["recent", "title", "progress"]);
const sidebarTabs = new Set(["toc", "highlights", "bookmarks"]);
const readingPresets = new Set(["custom", "comfortable", "compact", "large"]);
const highlightColors = new Set(["yellow", "green", "blue", "pink"]);
const highlightStyles = new Set(["highlight", "underline", "strikethrough", "squiggly"]);
const interfaceDensities = new Set(["comfortable", "compact"]);

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export function normalizeSettings(value: unknown): ReaderSettings {
  const input = value && typeof value === "object" ? value as Partial<ReaderSettings> : {};
  return {
    interfaceLanguage: interfaceLanguages.has(String(input.interfaceLanguage))
      ? input.interfaceLanguage as ReaderSettings["interfaceLanguage"]
      : DEFAULT_SETTINGS.interfaceLanguage,
    theme: themes.has(String(input.theme)) ? input.theme as ReaderSettings["theme"] : DEFAULT_SETTINGS.theme,
    layout: layouts.has(String(input.layout)) ? input.layout as ReaderSettings["layout"] : DEFAULT_SETTINGS.layout,
    tapToTurnPages: typeof input.tapToTurnPages === "boolean"
      ? input.tapToTurnPages
      : DEFAULT_SETTINGS.tapToTurnPages,
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
    bookshelfDisplayMode: bookshelfDisplayModes.has(String(input.bookshelfDisplayMode))
      ? input.bookshelfDisplayMode as ReaderSettings["bookshelfDisplayMode"] : DEFAULT_SETTINGS.bookshelfDisplayMode,
    bookshelfFilter: bookshelfFilters.has(String(input.bookshelfFilter))
      ? input.bookshelfFilter as ReaderSettings["bookshelfFilter"] : DEFAULT_SETTINGS.bookshelfFilter,
    bookshelfSort: bookshelfSorts.has(String(input.bookshelfSort))
      ? input.bookshelfSort as ReaderSettings["bookshelfSort"] : DEFAULT_SETTINGS.bookshelfSort,
    lastSidebarTab: sidebarTabs.has(String(input.lastSidebarTab))
      ? input.lastSidebarTab as ReaderSettings["lastSidebarTab"] : DEFAULT_SETTINGS.lastSidebarTab,
    readerChromeAutoHide: typeof input.readerChromeAutoHide === "boolean" ? input.readerChromeAutoHide : DEFAULT_SETTINGS.readerChromeAutoHide,
    readingPreset: readingPresets.has(String(input.readingPreset))
      ? input.readingPreset as ReaderSettings["readingPreset"] : DEFAULT_SETTINGS.readingPreset,
    defaultHighlightColor: highlightColors.has(String(input.defaultHighlightColor))
      ? input.defaultHighlightColor as ReaderSettings["defaultHighlightColor"] : DEFAULT_SETTINGS.defaultHighlightColor,
    defaultHighlightStyle: highlightStyles.has(String(input.defaultHighlightStyle))
      ? input.defaultHighlightStyle as ReaderSettings["defaultHighlightStyle"] : DEFAULT_SETTINGS.defaultHighlightStyle,
    connectAdjacentHighlights: typeof input.connectAdjacentHighlights === "boolean"
      ? input.connectAdjacentHighlights : DEFAULT_SETTINGS.connectAdjacentHighlights,
    interfaceDensity: interfaceDensities.has(String(input.interfaceDensity))
      ? input.interfaceDensity as ReaderSettings["interfaceDensity"] : DEFAULT_SETTINGS.interfaceDensity,
    hasSeenReaderTutorial: typeof input.hasSeenReaderTutorial === "boolean"
      ? input.hasSeenReaderTutorial : DEFAULT_SETTINGS.hasSeenReaderTutorial,
  };
}

export function createDefaultData(): ReaderData {
  return {
    schemaVersion: 5,
    settings: { ...DEFAULT_SETTINGS },
    books: {},
    importedLegacyDataPaths: [],
  };
}
