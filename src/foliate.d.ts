declare module "foliate-js/view.js" {
  export function makeBook(file: any): Promise<any>;
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
