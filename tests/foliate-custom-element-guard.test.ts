import { afterAll, describe, expect, it } from "vitest";
import {
  installFoliateCustomElementGuard,
  resetFoliateCustomElementGuardForTests,
} from "../src/foliate-custom-element-guard";

afterAll(() => resetFoliateCustomElementGuardForTests());

describe("Foliate custom element guard", () => {
  it("ignores duplicate Foliate registrations while preserving the first constructor", () => {
    installFoliateCustomElementGuard();
    class FirstFoliateView extends HTMLElement {}
    class DuplicateFoliateView extends HTMLElement {}
    if (!customElements.get("foliate-view")) customElements.define("foliate-view", FirstFoliateView);
    const first = customElements.get("foliate-view");

    expect(() => customElements.define("foliate-view", DuplicateFoliateView)).not.toThrow();
    expect(customElements.get("foliate-view")).toBe(first);
  });
});
