import { describe, expect, it, vi } from "vitest";
import { ReaderUiState } from "../src/reader-ui-state";

describe("ReaderUiState", () => {
  it("keeps one overlay active and prevents hiding chrome behind it", () => {
    const changed = vi.fn();
    const state = new ReaderUiState(changed);
    state.open("appearance");
    state.open("page-jump");
    state.hideChrome();
    expect(state.activeOverlay).toBe("page-jump");
    expect(state.isChromeHidden).toBe(false);
  });

  it("only closes the requested overlay", () => {
    const state = new ReaderUiState(() => undefined);
    state.open("selection");
    state.close("appearance");
    expect(state.activeOverlay).toBe("selection");
    state.close("selection");
    state.hideChrome();
    expect(state.isChromeHidden).toBe(true);
  });
});
