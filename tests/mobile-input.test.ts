import { describe, expect, it } from "vitest";
import {
  isPageTurnTap,
  isTextSelectionGesture,
  mobilePageTurnDirection,
  shouldIsolatePaginatorPointer,
  shouldSuppressTouchPageTurn,
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

  it("isolates touch pointers from Foliate's automatic selection paging", () => {
    expect(shouldIsolatePaginatorPointer("touch")).toBe(true);
    expect(shouldIsolatePaginatorPointer("mouse")).toBe(false);
    expect(shouldIsolatePaginatorPointer("pen")).toBe(false);
  });
});
