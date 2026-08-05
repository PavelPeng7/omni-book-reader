import { buildPublicationCss } from "./reader-style";
import type { ReaderSettings } from "./types";

export interface ReflowableRenderer {
  setAttribute(name: string, value: string): void;
  setStyles?: (css: string) => void;
}

export function resolveContentWidth(requestedWidth: number, viewportWidth?: number): number {
  if (!viewportWidth || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return requestedWidth;
  return Math.max(160, Math.min(requestedWidth, Math.floor(viewportWidth * 0.92)));
}

export function resolveWidthMode(
  settings: Pick<ReaderSettings, "widthMode" | "contentWidth" | "pageMargin">,
  viewportWidth?: number,
): { contentWidth: number; pageMargin: number } {
  const targets = {
    standard: settings.contentWidth,
    wide: Math.max(settings.contentWidth, 920),
    full: 1200,
    edge: viewportWidth ?? 1200,
  } as const;
  const viewportRatio = settings.widthMode === "standard" ? 0.92
    : settings.widthMode === "wide" ? 0.96
      : 1;
  const available = viewportWidth && Number.isFinite(viewportWidth)
    ? Math.max(160, Math.floor(viewportWidth * viewportRatio))
    : undefined;
  const contentWidth = available ? Math.min(targets[settings.widthMode], available) : targets[settings.widthMode];
  const pageMargin = settings.widthMode === "edge" ? 0
    : settings.widthMode === "full" ? Math.min(settings.pageMargin, 24)
      : settings.widthMode === "wide" ? Math.min(settings.pageMargin, 40)
        : settings.pageMargin;
  return { contentWidth, pageMargin };
}

export function resolveViewportWidth(
  readingAreaWidth: number,
  viewerWidth: number,
  compact: boolean,
): number | undefined {
  const areaWidth = Number.isFinite(readingAreaWidth) ? readingAreaWidth : 0;
  const measuredViewerWidth = Number.isFinite(viewerWidth) ? viewerWidth : 0;
  const reservedChrome = compact ? 16 : 132;
  const constrainedAreaWidth = areaWidth > reservedChrome ? areaWidth - reservedChrome : 0;
  const candidates = [constrainedAreaWidth, measuredViewerWidth].filter((value) => value > 0);
  if (!candidates.length) return undefined;
  return Math.max(160, Math.floor(Math.min(...candidates)));
}

/** Keep reflowable books on one centered page, even in a wide desktop leaf. */
export function applyReflowableLayout(
  renderer: ReflowableRenderer,
  settings: ReaderSettings,
  viewportWidth?: number,
): void {
  const { contentWidth, pageMargin } = resolveWidthMode(settings, viewportWidth);
  renderer.setAttribute("flow", settings.layout);
  renderer.setAttribute("margin", `${pageMargin}px`);
  renderer.setAttribute("max-inline-size", `${contentWidth}px`);
  renderer.setAttribute("max-block-size", "1440px");
  renderer.setAttribute("max-column-count", "1");
  renderer.setStyles?.(buildPublicationCss(settings));
}
