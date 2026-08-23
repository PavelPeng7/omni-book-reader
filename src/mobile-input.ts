export type PageTurnDirection = "previous" | "next";

interface KeyLike {
  key?: string;
  code?: string;
  keyCode?: number;
  which?: number;
}

const previousKeys = new Set(["AudioVolumeUp", "VolumeUp", "PageUp", "ArrowLeft", "ArrowUp"]);
const nextKeys = new Set(["AudioVolumeDown", "VolumeDown", "PageDown", "ArrowRight", "ArrowDown"]);
const previousAndroidKeyCodes = new Set([19, 21, 24, 33, 37, 38, 92]);
const nextAndroidKeyCodes = new Set([20, 22, 25, 34, 39, 40, 93]);

export function mobilePageTurnDirection(event: KeyLike): PageTurnDirection | null {
  if (previousKeys.has(event.key ?? "") || previousKeys.has(event.code ?? "")) return "previous";
  if (nextKeys.has(event.key ?? "") || nextKeys.has(event.code ?? "")) return "next";
  const legacyCode = event.keyCode ?? event.which;
  if (legacyCode !== undefined && previousAndroidKeyCodes.has(legacyCode)) return "previous";
  if (legacyCode !== undefined && nextAndroidKeyCodes.has(legacyCode)) return "next";
  return null;
}

export function tapPageTurnDirection(clientX: number, viewportWidth: number): PageTurnDirection | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;
  if (clientX < 0 || clientX > viewportWidth) return null;
  return clientX < viewportWidth / 2 ? "previous" : "next";
}

export function isPageTurnTap(
  start: { x: number; y: number; time: number },
  end: { x: number; y: number; time: number },
): boolean {
  const elapsed = end.time - start.time;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 550) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= 14;
}
