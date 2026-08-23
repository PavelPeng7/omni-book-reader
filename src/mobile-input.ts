export type PageTurnDirection = "previous" | "next";

interface KeyLike {
  key?: string;
  code?: string;
}

const previousKeys = new Set(["AudioVolumeUp", "VolumeUp", "PageUp", "ArrowLeft", "ArrowUp"]);
const nextKeys = new Set(["AudioVolumeDown", "VolumeDown", "PageDown", "ArrowRight", "ArrowDown"]);

export function mobilePageTurnDirection(event: KeyLike): PageTurnDirection | null {
  if (previousKeys.has(event.key ?? "") || previousKeys.has(event.code ?? "")) return "previous";
  if (nextKeys.has(event.key ?? "") || nextKeys.has(event.code ?? "")) return "next";
  return null;
}

export function tapPageTurnDirection(clientX: number, viewportWidth: number): PageTurnDirection | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;
  if (clientX < 0 || clientX > viewportWidth) return null;
  return clientX < viewportWidth / 2 ? "previous" : "next";
}
