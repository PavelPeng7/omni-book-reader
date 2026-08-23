import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRegisteredBlob,
  installBlobUrlRegistry,
  readRegisteredBlobAsText,
  resetBlobUrlRegistryForTests,
} from "../src/blob-url-registry";
import { inlineFoliateBlobMarkup } from "../src/foliate-blob-markup-normalizer";
import {
  installFoliateBlobIframePatch,
  normalizeDesktopFoliateSandboxValue,
  resetFoliateRuntimePatchesForTests,
} from "../src/foliate-runtime-patches";

const nativeCreateObjectUrl = URL.createObjectURL;
const nativeRevokeObjectUrl = URL.revokeObjectURL;
let blobs = new Map<string, Blob>();
let nextBlobId = 0;

function installObjectUrlStubs(): void {
  blobs = new Map();
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:omni-reader-${nextBlobId += 1}`;
    blobs.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => blobs.delete(url));
}

async function settleAsyncReaders(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 10));
}

afterEach(() => {
  resetFoliateRuntimePatchesForTests();
  resetBlobUrlRegistryForTests();
  URL.createObjectURL = nativeCreateObjectUrl;
  URL.revokeObjectURL = nativeRevokeObjectUrl;
  document.body.replaceChildren();
});

describe("Foliate mobile runtime compatibility", () => {
  it("retains Blob content after Foliate revokes its object URL", async () => {
    installObjectUrlStubs();
    installBlobUrlRegistry();
    const blob = new Blob(["body { margin: 0; }"], { type: "text/css" });
    const url = URL.createObjectURL(blob);

    URL.revokeObjectURL(url);

    expect(getRegisteredBlob(url)).toBe(blob);
    await expect(readRegisteredBlobAsText(url)).resolves.toBe("body { margin: 0; }");
  });

  it("inlines revoked stylesheets, nested assets, and images while removing active content", async () => {
    installObjectUrlStubs();
    installBlobUrlRegistry();
    const fontUrl = URL.createObjectURL(new Blob([new Uint8Array([1, 2, 3])], { type: "font/woff2" }));
    const imageUrl = URL.createObjectURL(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    const nestedCssUrl = URL.createObjectURL(new Blob([
      `@font-face { font-family: Book; src: url("${fontUrl}"); } p { font-family: Book; }`,
    ], { type: "text/css" }));
    const cssUrl = URL.createObjectURL(new Blob([
      `@import "${nestedCssUrl}"; body { background-image: url("${imageUrl}"); }`,
    ], { type: "text/css" }));
    for (const url of [fontUrl, imageUrl, nestedCssUrl, cssUrl]) URL.revokeObjectURL(url);

    const markup = await inlineFoliateBlobMarkup(`
      <html><head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'"/>
        <link rel="stylesheet" href="${cssUrl}"/>
        <script>alert(1)</script>
      </head><body onload="alert(2)"><img src="${imageUrl}"/><p>Chapter</p></body></html>
    `, "text/html");

    expect(markup).toContain("data-omni-inline-stylesheet");
    expect(markup).toContain("data:font/woff2;base64,");
    expect(markup).toContain("data:image/png;base64,");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("onload=");
    expect(markup.toLowerCase()).not.toContain("content-security-policy");
    expect(markup).not.toContain("blob:omni-reader");
  });

  it("loads a revoked Foliate chapter Blob through normalized iframe srcdoc", async () => {
    installObjectUrlStubs();
    installBlobUrlRegistry();
    installFoliateBlobIframePatch();
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const url = URL.createObjectURL(new Blob([
      "<html><body><script>bad()</script><p>Android chapter</p></body></html>",
    ], { type: "application/xhtml+xml" }));
    URL.revokeObjectURL(url);

    iframe.src = url;
    await settleAsyncReaders();

    expect(iframe.srcdoc).toContain("Android chapter");
    expect(iframe.srcdoc).not.toContain("<script");
    expect(iframe.getAttribute("src")).toBeNull();
  });

  it("leaves non-Blob iframe sources on the native setter", () => {
    installObjectUrlStubs();
    installBlobUrlRegistry();
    installFoliateBlobIframePatch();
    const iframe = document.createElement("iframe");
    iframe.src = "about:blank";
    expect(iframe.getAttribute("src")).toBe("about:blank");
  });

  it("removes allow-scripts only from Foliate desktop sandbox values", () => {
    expect(normalizeDesktopFoliateSandboxValue(
      "sandbox",
      "allow-same-origin allow-scripts",
      "at node_modules/foliate-js/paginator.js",
      null,
      false,
    )).toBe("allow-same-origin");
    expect(normalizeDesktopFoliateSandboxValue(
      "sandbox",
      "allow-same-origin allow-scripts",
      "at another-plugin.js",
      null,
      false,
    )).toBeNull();
    expect(normalizeDesktopFoliateSandboxValue(
      "sandbox",
      "allow-same-origin allow-scripts",
      "at node_modules/foliate-js/paginator.js",
      null,
      true,
    )).toBeNull();
  });
});
