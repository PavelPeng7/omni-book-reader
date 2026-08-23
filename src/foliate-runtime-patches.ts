import { readBlobUrlAsText } from "./blob-url-text";
import { inlineFoliateBlobMarkup } from "./foliate-blob-markup-normalizer";

let desktopSandboxPatchInstalled = false;
let blobIframePatchInstalled = false;
let originalIframeSrcDescriptor: PropertyDescriptor | undefined;
let iframeLoadTokens = new WeakMap<HTMLIFrameElement, number>();

function shadowHostName(element: Element | null): string {
  const root = element?.getRootNode();
  const host = root ? Reflect.get(root, "host") as unknown : undefined;
  return host && typeof host === "object" && "tagName" in host
    ? String(host.tagName).toLowerCase()
    : "";
}

export function normalizeDesktopFoliateSandboxValue(
  attributeName: string,
  value: string,
  stack: string | null,
  iframe: Element | null,
  isMobile: boolean,
): string | null {
  if (isMobile || attributeName.toLowerCase() !== "sandbox") return null;
  const normalized = value.trim();
  if (!normalized || !/allow-scripts/i.test(normalized)) return null;
  const foliateFrame = String(stack ?? "").toLowerCase().includes("foliate-js")
    || String(iframe?.getAttribute("part") ?? "").toLowerCase().split(/\s+/).includes("filter")
    || shadowHostName(iframe) === "foliate-view";
  if (!foliateFrame) return null;

  const tokens = new Set<string>();
  for (const token of normalized.split(/\s+/)) {
    if (token && token.toLowerCase() !== "allow-scripts") tokens.add(token);
  }
  return [...tokens].join(" ");
}

export function installDesktopFoliateIframeSandboxPatch(isMobile: boolean): void {
  if (isMobile || desktopSandboxPatchInstalled || typeof HTMLIFrameElement === "undefined") return;
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "setAttribute");
  const original = descriptor?.value as unknown;
  if (typeof original !== "function") return;
  HTMLIFrameElement.prototype.setAttribute = function patchedSetAttribute(
    name: string,
    value: string,
  ): void {
    const patched = normalizeDesktopFoliateSandboxValue(name, value, new Error().stack ?? null, this, false);
    Reflect.apply(original, this, [name, patched ?? value]);
  };
  desktopSandboxPatchInstalled = true;
}

/** Convert Foliate Blob chapter iframes to normalized srcdoc markup. */
export function installFoliateBlobIframePatch(onError?: (error: unknown) => void): void {
  if (blobIframePatchInstalled || typeof HTMLIFrameElement === "undefined") return;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
  if (!descriptor?.get || !descriptor.set) return;
  const getter = Reflect.get(descriptor, "get") as (this: HTMLIFrameElement) => string;
  const setter = Reflect.get(descriptor, "set") as (this: HTMLIFrameElement, value: string) => void;
  originalIframeSrcDescriptor = descriptor;

  Object.defineProperty(HTMLIFrameElement.prototype, "src", {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get(this: HTMLIFrameElement): string {
      return Reflect.apply(getter, this, []);
    },
    set(this: HTMLIFrameElement, value: string) {
      const url = String(value ?? "");
      if (!url.toLowerCase().startsWith("blob:")) {
        Reflect.apply(setter, this, [url]);
        return;
      }
      const token = (iframeLoadTokens.get(this) ?? 0) + 1;
      iframeLoadTokens.set(this, token);
      void readBlobUrlAsText(url)
        .then((markup) => inlineFoliateBlobMarkup(markup))
        .then((markup) => {
          if (iframeLoadTokens.get(this) === token) this.srcdoc = markup;
        })
        .catch((error: unknown) => {
          if (iframeLoadTokens.get(this) !== token) return;
          Reflect.apply(setter, this, [url]);
          onError?.(error);
        });
    },
  });
  blobIframePatchInstalled = true;
}

export function resetFoliateRuntimePatchesForTests(): void {
  if (desktopSandboxPatchInstalled) {
    Reflect.deleteProperty(HTMLIFrameElement.prototype, "setAttribute");
  }
  if (originalIframeSrcDescriptor) {
    Object.defineProperty(HTMLIFrameElement.prototype, "src", originalIframeSrcDescriptor);
  }
  desktopSandboxPatchInstalled = false;
  blobIframePatchInstalled = false;
  originalIframeSrcDescriptor = undefined;
  iframeLoadTokens = new WeakMap();
}
