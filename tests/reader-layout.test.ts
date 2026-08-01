import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/defaults";
import { applyReflowableLayout, resolveContentWidth, resolveViewportWidth } from "../src/reader-layout";

describe("reflowable reader layout", () => {
  it("uses a centered single page in wide paginated views", () => {
    const attributes = new Map<string, string>();
    const renderer = {
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      setStyles: vi.fn(),
    };

    applyReflowableLayout(renderer, DEFAULT_SETTINGS);

    expect(attributes.get("flow")).toBe("paginated");
    expect(attributes.get("max-column-count")).toBe("1");
    expect(attributes.get("max-inline-size")).toBe(`${DEFAULT_SETTINGS.contentWidth}px`);
    expect(attributes.get("max-block-size")).toBe("1440px");
    expect(attributes.get("margin")).toBe(`${DEFAULT_SETTINGS.pageMargin}px`);
    expect(renderer.setStyles).toHaveBeenCalledOnce();
  });

  it("shrinks the page width when sidebars leave a narrow reading viewport", () => {
    expect(resolveContentWidth(720, 600)).toBe(552);
    expect(resolveContentWidth(720, 1200)).toBe(720);
    expect(resolveContentWidth(720, 120)).toBe(160);

    const attributes = new Map<string, string>();
    applyReflowableLayout({
      setAttribute: (name, value) => attributes.set(name, value),
    }, DEFAULT_SETTINGS, 600);

    expect(attributes.get("max-inline-size")).toBe("552px");
  });

  it("caps an overflowing viewer to the reading area's actual remaining width", () => {
    expect(resolveViewportWidth(715, 1067, true)).toBe(699);
    expect(resolveViewportWidth(715, 615, false)).toBe(583);
    expect(resolveViewportWidth(1200, 1080, false)).toBe(1068);
    expect(resolveViewportWidth(0, 0, false)).toBeUndefined();
  });
});
