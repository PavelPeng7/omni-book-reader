declare module "foliate-js/view.js" {
  export interface FoliateBook {
    metadata?: { title?: unknown };
    sections?: Array<{ unload?: () => void }>;
    toc?: unknown[];
    destroy?: () => void;
  }

  export function makeBook(file: unknown): Promise<FoliateBook>;
}

declare module "foliate-js/epub.js" {
  export class EPUB {
    constructor(loader: {
      loadText(path: string): Promise<string | null>;
      loadBlob(path: string): Promise<Blob | null>;
      getSize(path: string): number;
    });
    init(): Promise<unknown>;
  }
}

declare module "foliate-js/vendor/zip.js" {
  export function configure(options: { useWebWorkers: boolean }): void;
  export class BlobReader { constructor(blob: Blob); }
  export class BlobWriter { constructor(type?: string); }
  export class TextWriter { constructor(encoding?: string); }
  export class ZipReader {
    constructor(reader: BlobReader);
    getEntries(options?: { onprogress?: (loaded: number, total: number) => void }): Promise<unknown[]>;
    close(): Promise<void>;
  }
}

declare module "foliate-js/footnotes.js" {
  export class FootnoteHandler extends EventTarget {
    detectFootnotes: boolean;
    handle(book: unknown, event: Event): Promise<void> | void;
  }
}

declare module "foliate-js/overlayer.js" {
  export class Overlayer {
    static highlight(rects: DOMRect[], options?: { color?: string; padding?: number }): SVGElement;
    static underline(rects: DOMRect[], options?: { color?: string; width?: number; padding?: number; writingMode?: string }): SVGElement;
    static strikethrough(rects: DOMRect[], options?: { color?: string; width?: number; writingMode?: string }): SVGElement;
    static squiggly(rects: DOMRect[], options?: { color?: string; width?: number; padding?: number; writingMode?: string }): SVGElement;
  }
}
