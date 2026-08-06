import { describe, expect, it } from "vitest";
import { uiLocale, uiText } from "../src/i18n";

describe("interface localization", () => {
  it("selects Chinese and English UI text", () => {
    expect(uiText("zh", "书架", "Bookshelf")).toBe("书架");
    expect(uiText("en", "书架", "Bookshelf")).toBe("Bookshelf");
  });

  it("uses a matching locale for dates and times", () => {
    expect(uiLocale("zh")).toBe("zh-CN");
    expect(uiLocale("en")).toBe("en-US");
  });
});
