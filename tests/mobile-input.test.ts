import { describe, expect, it } from "vitest";
import {
  isPageTurnTap,
  isTextSelectionGesture,
  mobilePageTurnDirection,
  pageTurnCrossesSection,
  shouldSuppressTouchPageTurn,
  shouldBlockPageTurnForSelection,
  selectionEdgePageTurnDirection,
  swipePageTurnDirection,
  tapPageTurnDirection,
} from "../src/mobile-input";

describe("mobilePageTurnDirection", () => {
  it("maps Android volume and page keys to reader navigation", () => {
    expect(mobilePageTurnDirection({ key: "AudioVolumeUp" })).toBe("previous");
    expect(mobilePageTurnDirection({ code: "AudioVolumeDown" })).toBe("next");
    expect(mobilePageTurnDirection({ key: "Unidentified", keyCode: 24 })).toBe("previous");
    expect(mobilePageTurnDirection({ key: "Unidentified", which: 25 })).toBe("next");
    expect(mobilePageTurnDirection({ key: "PageUp" })).toBe("previous");
    expect(mobilePageTurnDirection({ key: "PageDown" })).toBe("next");
  });

  it("does not consume unrelated Android keys", () => {
    expect(mobilePageTurnDirection({ key: "Escape" })).toBeNull();
    expect(mobilePageTurnDirection({ key: "Help" })).toBeNull();
  });

  it("maps the left and right viewport halves to page turns", () => {
    expect(tapPageTurnDirection(0, 400)).toBe("previous");
    expect(tapPageTurnDirection(199, 400)).toBe("previous");
    expect(tapPageTurnDirection(200, 400)).toBe("next");
    expect(tapPageTurnDirection(400, 400)).toBe("next");
  });

  it("ignores taps without a valid viewport coordinate", () => {
    expect(tapPageTurnDirection(-1, 400)).toBeNull();
    expect(tapPageTurnDirection(401, 400)).toBeNull();
    expect(tapPageTurnDirection(20, 0)).toBeNull();
    expect(tapPageTurnDirection(Number.NaN, 400)).toBeNull();
  });

  it("distinguishes a short tap from a swipe or long press", () => {
    const start = { x: 80, y: 120, time: 1000 };
    expect(isPageTurnTap(start, { x: 86, y: 126, time: 1220 })).toBe(true);
    expect(isPageTurnTap(start, { x: 120, y: 126, time: 1220 })).toBe(false);
    expect(isPageTurnTap(start, { x: 82, y: 122, time: 1700 })).toBe(false);
  });

  it("turns a short horizontal swipe into exactly one page direction", () => {
    const start = { x: 240, y: 300, time: 1000 };
    expect(swipePageTurnDirection(start, { x: 190, y: 304, time: 1300 })).toBe("next");
    expect(swipePageTurnDirection(start, { x: 290, y: 296, time: 1300 })).toBe("previous");
    expect(swipePageTurnDirection(start, { x: 220, y: 250, time: 1300 })).toBeNull();
    expect(swipePageTurnDirection(start, { x: 190, y: 304, time: 2600 })).toBeNull();
  });

  it("suppresses page turns for native text selection and long presses", () => {
    const start = { x: 80, y: 120, time: 1000 };
    expect(shouldSuppressTouchPageTurn(start, { x: 82, y: 122, time: 1200 }, true)).toBe(true);
    expect(shouldSuppressTouchPageTurn(start, { x: 120, y: 122, time: 1500 }, false)).toBe(true);
    expect(shouldSuppressTouchPageTurn(start, { x: 120, y: 122, time: 1499 }, false)).toBe(false);
  });

  it("keeps selection-handle gestures suppressed if the native selection briefly collapses", () => {
    expect(isTextSelectionGesture(true, false, false)).toBe(true);
    expect(isTextSelectionGesture(false, true, false)).toBe(true);
    expect(isTextSelectionGesture(false, false, true)).toBe(true);
    expect(isTextSelectionGesture(false, false, false)).toBe(false);
  });

  it("blocks page turns while selection state is active or settling", () => {
    expect(shouldBlockPageTurnForSelection(true, false, 1000, 0)).toBe(true);
    expect(shouldBlockPageTurnForSelection(false, true, 1000, 0)).toBe(true);
    expect(shouldBlockPageTurnForSelection(false, false, 1000, 1200)).toBe(true);
    expect(shouldBlockPageTurnForSelection(false, false, 1201, 1200)).toBe(false);
  });

  it("turns pages only when a selection handle stays near a valid viewport edge", () => {
    expect(selectionEdgePageTurnDirection(20, 400)).toBe("previous");
    expect(selectionEdgePageTurnDirection(380, 400)).toBe("next");
    expect(selectionEdgePageTurnDirection(200, 400)).toBeNull();
    expect(selectionEdgePageTurnDirection(-1, 400)).toBeNull();
    expect(selectionEdgePageTurnDirection(20, 80)).toBeNull();
  });

  it("detects section boundaries before a selection edge turn", () => {
    expect(pageTurnCrossesSection("previous", "ltr", 1, 8)).toBe(true);
    expect(pageTurnCrossesSection("next", "ltr", 6, 8)).toBe(true);
    expect(pageTurnCrossesSection("next", "ltr", 5, 8)).toBe(false);
    expect(pageTurnCrossesSection("previous", "ltr", 2, 8)).toBe(false);
  });

  it("reverses selection boundary directions for RTL books", () => {
    expect(pageTurnCrossesSection("next", "rtl", 1, 8)).toBe(true);
    expect(pageTurnCrossesSection("previous", "rtl", 6, 8)).toBe(true);
    expect(pageTurnCrossesSection("next", "rtl", 2, 8)).toBe(false);
    expect(pageTurnCrossesSection("previous", "rtl", 5, 8)).toBe(false);
  });

  it("does not infer a boundary without valid paginator state", () => {
    expect(pageTurnCrossesSection("next", "ltr", undefined, 8)).toBe(false);
    expect(pageTurnCrossesSection("next", "ltr", 6, undefined)).toBe(false);
    expect(pageTurnCrossesSection("next", "ltr", 1, 2)).toBe(false);
  });
});
