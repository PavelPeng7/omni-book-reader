import { isBlobUrl, readBlobUrlAsText } from "./blob-url-text";

interface FoliateBlobIframePatchOptions {
  onError?: (error: unknown) => void;
}

type UrlApi = typeof URL & {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};

const registeredBlobs = new Map<string, Blob>();
const iframeLoadTokens = new WeakMap<HTMLIFrameElement, number>();
const errorHandlers = new Set<(error: unknown) => void>();
let installationCount = 0;
let iframeSrcDescriptor: PropertyDescriptor | undefined;
let originalCreateObjectUrl: ((blob: Blob) => string) | undefined;
let originalRevokeObjectUrl: ((url: string) => void) | undefined;

function isMarkupBlob(blob: Blob | undefined): boolean {
  if (!blob?.type) return true;
  return /(?:html|xhtml|svg)\+?xml|text\/html/i.test(blob.type);
}

function isInsideFoliateView(iframe: HTMLIFrameElement): boolean {
  let current: Node | null = iframe;
  for (let depth = 0; current && depth < 16; depth += 1) {
    if ((current as Element).localName?.toLowerCase() === "foliate-view") return true;
    current = current.parentNode ?? (current as ShadowRoot).host ?? null;
  }
  return false;
}

function reportError(error: unknown): void {
  for (const handler of errorHandlers) handler(error);
}

function getOwnFunction<T extends (...args: never[]) => unknown>(
  target: object,
  property: PropertyKey,
): T | undefined {
  const value = Object.getOwnPropertyDescriptor(target, property)?.value as unknown;
  return typeof value === "function" ? value as T : undefined;
}

function installPatch(): boolean {
  const urlApi = URL as UrlApi;
  const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
  const createObjectUrl = getOwnFunction<(blob: Blob) => string>(urlApi, "createObjectURL");
  const revokeObjectUrl = getOwnFunction<(url: string) => void>(urlApi, "revokeObjectURL");
  if (!descriptor?.get || !descriptor.set
    || !createObjectUrl
    || !revokeObjectUrl) return false;

  iframeSrcDescriptor = descriptor;
  originalCreateObjectUrl = createObjectUrl;
  originalRevokeObjectUrl = revokeObjectUrl;

  urlApi.createObjectURL = (blob: Blob): string => {
    const url = Reflect.apply(originalCreateObjectUrl!, urlApi, [blob]);
    registeredBlobs.set(url, blob);
    return url;
  };
  urlApi.revokeObjectURL = (url: string): void => {
    registeredBlobs.delete(url);
    Reflect.apply(originalRevokeObjectUrl!, urlApi, [url]);
  };

  Object.defineProperty(HTMLIFrameElement.prototype, "src", {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get(this: HTMLIFrameElement): string {
      return descriptor.get!.call(this) as string;
    },
    set(this: HTMLIFrameElement, value: string) {
      const normalizedUrl = String(value ?? "");
      const blob = registeredBlobs.get(normalizedUrl);
      if (!isBlobUrl(normalizedUrl) || !isInsideFoliateView(this) || !isMarkupBlob(blob)) {
        descriptor.set!.call(this, normalizedUrl);
        return;
      }

      const token = (iframeLoadTokens.get(this) ?? 0) + 1;
      iframeLoadTokens.set(this, token);
      void readBlobUrlAsText(normalizedUrl, blob)
        .then((markup) => {
          if (iframeLoadTokens.get(this) !== token) return;
          this.srcdoc = markup;
        })
        .catch((error: unknown) => {
          if (iframeLoadTokens.get(this) !== token) return;
          descriptor.set!.call(this, normalizedUrl);
          reportError(error);
        });
    },
  });
  return true;
}

function uninstallPatch(): void {
  const urlApi = URL as UrlApi;
  if (iframeSrcDescriptor) {
    Object.defineProperty(HTMLIFrameElement.prototype, "src", iframeSrcDescriptor);
  }
  if (originalCreateObjectUrl) urlApi.createObjectURL = originalCreateObjectUrl;
  if (originalRevokeObjectUrl) urlApi.revokeObjectURL = originalRevokeObjectUrl;
  iframeSrcDescriptor = undefined;
  originalCreateObjectUrl = undefined;
  originalRevokeObjectUrl = undefined;
  registeredBlobs.clear();
}

/**
 * Convert Foliate chapter Blob iframe sources to srcdoc on mobile WebViews.
 * The returned cleanup is reference-counted so multiple reader leaves are safe.
 */
export function installFoliateBlobIframePatch(
  options: FoliateBlobIframePatchOptions = {},
): () => void {
  if (options.onError) errorHandlers.add(options.onError);
  if (installationCount === 0 && !installPatch()) {
    if (options.onError) errorHandlers.delete(options.onError);
    return () => undefined;
  }
  installationCount += 1;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (options.onError) errorHandlers.delete(options.onError);
    installationCount -= 1;
    if (installationCount === 0) uninstallPatch();
  };
}
