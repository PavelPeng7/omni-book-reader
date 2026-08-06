import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/defaults";
import { buildPublicationCss } from "../src/reader-style";

describe("publication typography", () => {
  afterEach(() => document.body.removeAttribute("style"));

  it("inherits concrete Obsidian typography and applies comfortable reading rhythm", () => {
    document.body.style.fontFamily = '"Test UI", sans-serif';
    document.body.style.fontSize = "18px";
    document.body.style.setProperty("--font-text-size", "18px");
    const css = buildPublicationCss(DEFAULT_SETTINGS);

    expect(css).toContain("--pavel-reader-font-size: calc(18px * 1)");
    expect(css).toContain('html, body { font-family: "Test UI", sans-serif !important; }');
    expect(css).toContain("--pavel-reader-letter-spacing: 0.01em");
    expect(css).toContain("--pavel-reader-paragraph-spacing: 0.65em");
    expect(css).toContain("text-rendering: optimizeLegibility");
    expect(css).toContain("background: #f9f8f4 !important");
    expect(css).toContain("color: #2d3a31 !important");
  });

  it("keeps publisher font families when original-book mode is selected", () => {
    const css = buildPublicationCss({ ...DEFAULT_SETTINGS, font: "publisher" });
    expect(css).not.toMatch(/html, body \{ font-family: .* !important; \}/);
    expect(css).toContain("margin-block-end: var(--pavel-reader-paragraph-spacing) !important");
    expect(css).toContain("line-height: 1.35 !important");
  });

  it("keeps book content selectable and constrains complex publication content", () => {
    const css = buildPublicationCss(DEFAULT_SETTINGS);

    expect(css).toContain("-webkit-touch-callout: default");
    expect(css).toContain("user-select: text");
    expect(css).toContain("orphans: 2");
    expect(css).toContain("widows: 2");
    expect(css).toContain("max-inline-size: 100% !important; break-inside: avoid");
    expect(css).toContain("white-space: pre-wrap !important");
    expect(css).toContain('a[epub\\:type~="noteref"]');
  });
});
