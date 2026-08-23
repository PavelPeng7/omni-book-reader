import { describe, expect, it } from "vitest";
import { isPageTurnTap, mobilePageTurnDirection, tapPageTurnDirection } from "../src/mobile-input";

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
});
