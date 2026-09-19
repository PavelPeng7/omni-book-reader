import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("mobile reader sidebar layout", () => {
  it("keeps the active panel independently scrollable by touch", () => {
    const panels = declarations(".omni-book-reader-panels");
    const panel = declarations(".omni-book-reader-panel");

    expect(panels).toContain("min-height: 0");
    expect(panels).toContain("overflow: hidden");
    expect(panel).toContain("min-height: 0");
    expect(panel).toContain("overflow-y: auto");
    expect(panel).toContain("-webkit-overflow-scrolling: touch");
    expect(panel).toContain("touch-action: pan-y");
  });

  it("does not consume horizontal space for every nested TOC level", () => {
    const nestedList = declarations(".omni-book-reader-toc-list .omni-book-reader-toc-list");
    expect(nestedList).toContain("margin-left: 0");
    expect(nestedList).toContain("padding-left: 0");
  });

  it("prioritizes 摘录 text without horizontal overflow", () => {
    const savedContent = declarations(".omni-book-reader-saved-content");
    const panel = declarations(".omni-book-reader-panel");

    expect(styles).toMatch(/\.omni-book-reader-highlight-text\s*\{\s*-webkit-line-clamp:\s*4;/);
    expect(savedContent).toContain("min-width: 0");
    expect(panel).toContain("overflow-x: hidden");
  });
});
