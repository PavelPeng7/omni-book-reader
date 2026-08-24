import type { FoliateRenderer } from "./types";

export function annotationValueAtPoint(
  renderer: Pick<FoliateRenderer, "getContents"> | null | undefined,
  document: Document,
  x: number,
  y: number,
): string | null {
  const content = renderer?.getContents?.().find((item) => item.doc === document);
  return content?.overlayer?.hitTest({ x, y })[0] ?? null;
}
