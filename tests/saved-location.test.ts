import { describe, expect, it, vi } from "vitest";
import { canNavigateToSavedLocation } from "../src/saved-location";

describe("saved location navigation", () => {
  it("allows a resolvable CFI without relying on goTo's return value", () => {
    const resolveNavigation = vi.fn((target: string) => target === "epubcfi(/6/4)" ? { index: 2 } : undefined);

    expect(canNavigateToSavedLocation("epubcfi(/6/4)", resolveNavigation)).toBe(true);
    expect(canNavigateToSavedLocation("epubcfi(/6/8)", resolveNavigation)).toBe(false);
    expect(canNavigateToSavedLocation("   ", resolveNavigation)).toBe(false);
  });
});
