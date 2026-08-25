import { describe, expect, it } from "vitest";
import { connectAdjacentHighlightRanges } from "../src/highlight-range-connection";

function textRange(text: Text, start: number, end: number): Range {
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  return range;
}

describe("connectAdjacentHighlightRanges", () => {
  it("connects highlights on both sides across whitespace", () => {
    document.body.textContent = "Alpha beta gamma";
    const text = document.body.firstChild as Text;
    const result = connectAdjacentHighlightRanges(textRange(text, 6, 10), [
      { value: "previous", range: textRange(text, 0, 5) },
      { value: "next", range: textRange(text, 11, 16) },
    ]);

    expect(result.range.toString()).toBe("Alpha beta gamma");
    expect(result.connected).toEqual(["previous", "next"]);
  });

  it("connects overlapping highlight ranges", () => {
    document.body.textContent = "Alpha beta";
    const text = document.body.firstChild as Text;
    const result = connectAdjacentHighlightRanges(textRange(text, 3, 8), [
      { value: "overlap", range: textRange(text, 0, 5) },
    ]);

    expect(result.range.toString()).toBe("Alpha be");
    expect(result.connected).toEqual(["overlap"]);
  });

  it("does not bridge unselected words", () => {
    document.body.textContent = "Alpha beta gamma";
    const text = document.body.firstChild as Text;
    const initial = textRange(text, 11, 16);
    const result = connectAdjacentHighlightRanges(initial, [
      { value: "distant", range: textRange(text, 0, 5) },
    ]);

    expect(result.range.toString()).toBe("gamma");
    expect(result.connected).toEqual([]);
  });
});
