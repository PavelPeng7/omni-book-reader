export type ReaderTheme = "auto" | "light" | "dark" | "sepia";
export type ReaderLayout = "paginated" | "scrolled";
export type ReaderFont = "obsidian" | "publisher" | "serif" | "sans";
export type ReaderWidthMode = "standard" | "wide" | "full" | "edge";
export type HighlightColor = "yellow" | "green" | "blue" | "pink";
export type HighlightStyle = "highlight" | "underline" | "strikethrough" | "squiggly";
export type ExportTemplatePreset = "classic" | "compact" | "callout" | "custom";
export type InterfaceLanguage = "zh" | "en";
export type BookshelfDisplayMode = "list" | "grid" | "covers";
export type BookshelfFilter = "all" | "reading" | "finished" | "reading-list";
export type BookshelfSort = "recent" | "title" | "progress";
export type SidebarPreference = "toc" | "highlights" | "bookmarks";
export type ReadingPreset = "custom" | "comfortable" | "compact" | "large";
export type InterfaceDensity = "comfortable" | "compact";

export interface ReaderSettings {
  interfaceLanguage: InterfaceLanguage;
  theme: ReaderTheme;
  layout: ReaderLayout;
  tapToTurnPages: boolean;
  font: ReaderFont;
  fontSizePercent: number;
  lineHeight: number;
  letterSpacing: number;
  paragraphSpacing: number;
  widthMode: ReaderWidthMode;
  contentWidth: number;
  pageMargin: number;
  exportTemplate: ExportTemplatePreset;
  customExportTemplatePath: string;
  bookshelfDisplayMode: BookshelfDisplayMode;
  bookshelfFilter: BookshelfFilter;
  bookshelfSort: BookshelfSort;
  lastSidebarTab: SidebarPreference;
  readerChromeAutoHide: boolean;
  readingPreset: ReadingPreset;
  defaultHighlightColor: HighlightColor;
  defaultHighlightStyle: HighlightStyle;
  connectAdjacentHighlights: boolean;
  interfaceDensity: InterfaceDensity;
  hasSeenReaderTutorial: boolean;
}

export interface SourceSignature {
  size: number;
  mtime: number;
}

export interface ReadingPosition {
  cfi: string;
  fraction: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  cfi: string;
  fraction: number;
  chapter: string;
  createdAt: number;
  stale?: boolean;
}

export interface ReaderHighlight {
  id: string;
  cfi: string;
  text: string;
  chapter: string;
  color: HighlightColor;
  style: HighlightStyle;
  tags: string[];
  sectionIndex: number;
  createdAt: number;
  note?: string;
  noteUpdatedAt?: number;
  stale?: boolean;
}

export interface AnnotationDocuments {
  highlightPath: string;
  notePath: string;
  createdDate: string;
}

export interface ReadingStats {
  totalReadingMs: number;
  lastOpenedAt: number;
  lastReadAt: number;
  furthestFraction: number;
  completedAt?: number;
}

export interface BookState {
  sourceSignature: SourceSignature;
  position?: ReadingPosition;
  bookmarks: Bookmark[];
  highlights: ReaderHighlight[];
  annotationDocuments?: AnnotationDocuments;
  readingStats?: ReadingStats;
  /** User-managed bookshelf metadata. These fields never affect the EPUB itself. */
  hiddenFromBookshelf?: boolean;
  inReadingList?: boolean;
  customCoverPath?: string;
}

export interface ReaderData {
  schemaVersion: 5;
  settings: ReaderSettings;
  books: Record<string, BookState>;
  importedLegacyDataPaths: string[];
}

export interface FoliateTocItem {
  label?: unknown;
  href?: string;
  subitems?: FoliateTocItem[];
}

export interface FoliateMetadata {
  title?: unknown;
  author?: unknown;
  language?: unknown;
}

export interface FoliateBook {
  toc?: FoliateTocItem[];
  metadata?: FoliateMetadata;
  dir?: "ltr" | "rtl";
  rendition?: { layout?: string };
  transformTarget?: EventTarget;
  getCover?: () => Promise<Blob | null>;
  destroy?: () => void;
  sections?: Array<{ unload?: () => void }>;
}

export interface FoliateRenderer extends HTMLElement {
  page?: number;
  pages?: number;
  setStyles?: (css: string) => void;
  getContents?: () => Array<{ doc: Document; index: number; overlayer?: FoliateOverlayer }>;
}

export interface FoliateOverlayer {
  hitTest(point: { x: number; y: number }): readonly [] | readonly [string, Range];
}

export interface FoliateLocation {
  cfi?: string;
  fraction?: number;
  tocItem?: { label?: unknown; href?: string };
  pageItem?: { label?: unknown };
  location?: { current?: number; total?: number };
}

export interface FoliateSearchExcerpt {
  pre?: string;
  match?: string;
  post?: string;
}

export interface FoliateSearchItem {
  cfi: string;
  excerpt?: string | FoliateSearchExcerpt;
}

export type FoliateSearchResult =
  | "done"
  | { progress: number }
  | { label?: string; subitems: FoliateSearchItem[] };

export interface FoliateViewElement extends HTMLElement {
  book: FoliateBook;
  renderer: FoliateRenderer;
  isFixedLayout?: boolean;
  lastLocation?: FoliateLocation;
  open(source: File | FoliateBook): Promise<void>;
  init(options: { lastLocation?: string; showTextStart: boolean }): Promise<void>;
  close(): void;
  goLeft(): Promise<void> | void;
  goRight(): Promise<void> | void;
  prev(): Promise<void> | void;
  next(): Promise<void> | void;
  goToTextStart(): Promise<void>;
  goTo(target: string | number): Promise<unknown>;
  goToFraction(fraction: number): Promise<void>;
  select(target: string): Promise<void>;
  deselect(): void;
  getCFI(index: number, range?: Range): string;
  resolveNavigation(target: string | number): { index: number; anchor?: unknown } | undefined;
  addAnnotation(annotation: { value: string; color?: string; style?: HighlightStyle }): Promise<unknown>;
  deleteAnnotation(annotation: { value: string }): Promise<unknown>;
  search(options: {
    query: string;
    matchCase: boolean;
    matchDiacritics: boolean;
    matchWholeWords: boolean;
  }): AsyncGenerator<FoliateSearchResult>;
  clearSearch(): void;
}

export interface PublicationTransformDetail {
  data: string | Blob | Promise<string | Blob>;
  type?: string;
  name?: string;
}
