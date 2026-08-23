import { afterEach, describe, expect, it, vi } from "vitest";
import { installFoliateBlobIframePatch } from "../src/foliate-runtime-patches";

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
let nextBlobId = 0;

function installObjectUrlStubs(): void {
  URL.createObjectURL = vi.fn(() => `blob:omni-reader-${nextBlobId += 1}`);
  URL.revokeObjectURL = vi.fn();
}

async function settleFileReader(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

afterEach(() => {
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
  document.body.replaceChildren();
});

describe("installFoliateBlobIframePatch", () => {
  it("loads Foliate chapter Blob markup through iframe srcdoc", async () => {
    installObjectUrlStubs();
    const cleanup = installFoliateBlobIframePatch();
    const foliateView = document.createElement("foliate-view");
    const shadow = foliateView.attachShadow({ mode: "open" });
    const iframe = document.createElement("iframe");
    shadow.append(iframe);
    document.body.append(foliateView);

    const url = URL.createObjectURL(new Blob(["<html><body>Android chapter</body></html>"], {
      type: "application/xhtml+xml",
    }));
    iframe.src = url;
    await settleFileReader();

    expect(iframe.srcdoc).toContain("Android chapter");
    expect(iframe.getAttribute("src")).toBeNull();
    cleanup();
  });

  it("does not intercept Blob iframes outside Foliate", () => {
    installObjectUrlStubs();
    const cleanup = installFoliateBlobIframePatch();
    const iframe = document.createElement("iframe");
    document.body.append(iframe);

    const url = URL.createObjectURL(new Blob(["plain"], { type: "text/html" }));
    iframe.src = url;

    expect(iframe.getAttribute("src")).toBe(url);
    expect(iframe.srcdoc).toBe("");
    cleanup();
  });

  it("restores URL and iframe APIs after the last reader closes", () => {
    installObjectUrlStubs();
    const stubCreate = URL.createObjectURL;
    const iframeDescriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
    const cleanupFirst = installFoliateBlobIframePatch();
    const cleanupSecond = installFoliateBlobIframePatch();

    cleanupFirst();
    expect(URL.createObjectURL).not.toBe(stubCreate);
    cleanupSecond();

    expect(URL.createObjectURL).toBe(stubCreate);
    expect(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src")?.set)
      .toBe(iframeDescriptor?.set);
  });
});
