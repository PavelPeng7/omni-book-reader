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
    const panels = declarations(".pavel-epub-panels");
    const panel = declarations(".pavel-epub-panel");

    expect(panels).toContain("min-height: 0");
    expect(panels).toContain("overflow: hidden");
    expect(panel).toContain("min-height: 0");
    expect(panel).toContain("overflow-y: auto");
    expect(panel).toContain("-webkit-overflow-scrolling: touch");
    expect(panel).toContain("touch-action: pan-y");
  });

  it("does not consume horizontal space for every nested TOC level", () => {
    const nestedList = declarations(".pavel-epub-toc-list .pavel-epub-toc-list");
    expect(nestedList).toContain("margin-left: 0");
    expect(nestedList).toContain("padding-left: 0");
  });
});
