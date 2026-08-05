import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, createDefaultData, normalizeSettings } from "../src/defaults";

describe("reader settings", () => {
  it("creates independent default data", () => {
    const first = createDefaultData();
    const second = createDefaultData();
    first.settings.theme = "dark";
    expect(second.settings).toEqual(DEFAULT_SETTINGS);
    expect(second.books).toEqual({});
  });

  it("normalizes enum values and clamps numeric settings", () => {
    expect(normalizeSettings({
      theme: "invalid",
      layout: "scrolled",
      font: "sans",
      fontSizePercent: 999,
      lineHeight: 0.4,
      letterSpacing: 1,
      paragraphSpacing: -1,
      contentWidth: 2000,
      pageMargin: -20,
    })).toEqual({
      theme: "auto",
      layout: "scrolled",
      font: "sans",
      fontSizePercent: 180,
      lineHeight: 1.2,
      letterSpacing: 0.12,
      paragraphSpacing: 0,
      widthMode: "standard",
      contentWidth: 1200,
      pageMargin: 0,
      exportTemplate: "classic",
      customExportTemplatePath: "",
    });
    expect(normalizeSettings({
      exportTemplate: "custom",
      customExportTemplatePath: "模板\\EPUB 导出.md",
    }).exportTemplate).toBe("custom");
    expect(normalizeSettings({
      exportTemplate: "callout",
      customExportTemplatePath: "模板\\EPUB 导出.md",
    }).customExportTemplatePath).toBe("模板/EPUB 导出.md");
  });
});
