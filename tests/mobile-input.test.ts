import { describe, expect, it } from "vitest";
import { mobilePageTurnDirection } from "../src/mobile-input";

describe("mobilePageTurnDirection", () => {
  it("maps Android volume and page keys to reader navigation", () => {
    expect(mobilePageTurnDirection({ key: "AudioVolumeUp" })).toBe("previous");
    expect(mobilePageTurnDirection({ code: "AudioVolumeDown" })).toBe("next");
    expect(mobilePageTurnDirection({ key: "PageUp" })).toBe("previous");
    expect(mobilePageTurnDirection({ key: "PageDown" })).toBe("next");
  });

  it("does not consume unrelated Android keys", () => {
    expect(mobilePageTurnDirection({ key: "Escape" })).toBeNull();
    expect(mobilePageTurnDirection({ key: "Help" })).toBeNull();
  });
});
