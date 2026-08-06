import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

describe("bookshelf mobile scrolling", () => {
  it("makes Obsidian's bookshelf view-content the native vertical scroll container", () => {
    const rule = styles.match(
      /\.pavel-epub-bookshelf-container \.view-content\.pavel-epub-bookshelf\s*\{([^}]*)\}/,
    )?.[1];

    expect(rule).toBeDefined();
    expect(rule).toContain("display: block");
    expect(rule).toContain("height: 100%");
    expect(rule).toContain("overflow-y: auto");
    expect(rule).toContain("-webkit-overflow-scrolling: touch");
    expect(rule).toContain("touch-action: pan-y");
    expect(rule).not.toContain("overflow: hidden");
  });
});
