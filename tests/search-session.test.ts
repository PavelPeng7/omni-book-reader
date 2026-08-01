import { describe, expect, it } from "vitest";
import { SearchSession } from "../src/search-session";
import { excerptToText, isValidCfi } from "../src/utils";

describe("search session", () => {
  it("invalidates previous searches", () => {
    const session = new SearchSession();
    const first = session.begin();
    const second = session.begin();
    expect(session.isActive(first)).toBe(false);
    expect(session.isActive(second)).toBe(true);
    session.cancel();
    expect(session.isActive(second)).toBe(false);
  });

  it("formats excerpts and validates CFI values", () => {
    expect(excerptToText({ pre: "before ", match: "match", post: " after" })).toBe("before match after");
    expect(isValidCfi("epubcfi(/6/2!/4/2:0)")).toBe(true);
    expect(isValidCfi("/6/2!/4/2:0")).toBe(false);
  });
});
