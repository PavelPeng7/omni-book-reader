import { describe, expect, it } from "vitest";
import { sanitizePublicationMarkup, sanitizeTransformData } from "../src/sanitizer";

describe("publication sanitizer", () => {
  it("removes executable HTML and installs a restrictive CSP", () => {
    const source = `<!doctype html><html><head>
      <meta http-equiv="refresh" content="0; url=https://bad.example">
      <script>globalThis.pwned = true</script>
    </head><body onload="bad()">
      <iframe src="https://bad.example"></iframe>
      <a id="bad" href="java\nscript:alert(1)" onclick="bad()">bad</a>
      <img id="good" src="data:image/png;base64,AA==">
      <img id="remote" src="https://tracking.example/pixel.png">
      <a id="external" href="https://example.com">external</a>
    </body></html>`;
    const result = sanitizePublicationMarkup(source, "text/html");
    const document = new DOMParser().parseFromString(result, "text/html");

    expect(document.querySelector("script, iframe, meta[http-equiv='refresh']")).toBeNull();
    expect(document.body.hasAttribute("onload")).toBe(false);
    expect(document.querySelector("#bad")?.hasAttribute("href")).toBe(false);
    expect(document.querySelector("#bad")?.hasAttribute("onclick")).toBe(false);
    expect(document.querySelector("#good")?.getAttribute("src")).toContain("data:image/png");
    expect(document.querySelector("#remote")?.hasAttribute("src")).toBe(false);
    expect(document.querySelector("#external")?.getAttribute("href")).toBe("https://example.com");
    expect(document.querySelector("meta[http-equiv='Content-Security-Policy']")?.getAttribute("content"))
      .toContain("script-src 'none'");
  });

  it("sanitizes SVG and preserves the input Blob media type", async () => {
    const blob = new Blob([
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://tracking.example/a.png"/><a href="javascript:bad()"><text>safe</text></a></svg>`,
    ], { type: "image/svg+xml" });
    const result = await sanitizeTransformData(blob, "image/svg+xml");
    expect(result).toBeInstanceOf(Blob);
    expect((result as Blob).type).toBe("image/svg+xml");
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsText(result as Blob);
    });
    expect(text).not.toContain("<script");
    expect(text.toLowerCase()).not.toContain("javascript:");
    expect(text).not.toContain("tracking.example");
    expect(text).toContain("safe");
  });
});
