import type { PublicationTransformDetail } from "./types";

const CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "connect-src 'none'",
  "frame-src 'none'",
  "img-src blob: data:",
  "font-src blob: data:",
  "media-src blob: data:",
  "style-src 'unsafe-inline' blob: data:",
].join("; ");

const removedElements = "script, iframe, frame, frameset, object, embed, applet";
const urlAttributes = new Set(["href", "src", "xlink:href", "action", "formaction", "poster"]);

function isDangerousUrl(value: string): boolean {
  const normalized = Array.from(value, (character) => character.charCodeAt(0) <= 32 ? "" : character).join("").toLowerCase();
  return normalized.startsWith("javascript:")
    || normalized.startsWith("vbscript:")
    || normalized.startsWith("data:text/html")
    || normalized.startsWith("data:application/xhtml+xml")
    || normalized.startsWith("data:image/svg+xml");
}

function isRemoteUrl(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value.trim());
}

function sanitizeDocument(document: Document, isHtml: boolean): void {
  for (const element of Array.from(document.querySelectorAll(removedElements))) element.remove();
  for (const element of Array.from(document.querySelectorAll("meta[http-equiv]"))) {
    const value = element.getAttribute("http-equiv")?.trim().toLowerCase();
    if (value === "refresh" || value === "content-security-policy") element.remove();
  }

  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (urlAttributes.has(name) && isDangerousUrl(value)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (urlAttributes.has(name) && isRemoteUrl(value)
        && !(element.localName.toLowerCase() === "a" && (name === "href" || name === "xlink:href"))) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style" && /(expression\s*\(|url\s*\(\s*['"]?\s*(?:javascript|vbscript|https?:|\/\/)|-moz-binding)/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  for (const style of Array.from(document.querySelectorAll("style"))) {
    style.textContent = (style.textContent ?? "")
      .replace(/@import\s+(?:url\s*\()?\s*['"]?(?:https?:)?\/\/[^;]+;?/gi, "")
      .replace(/url\s*\(\s*(['"]?)(?:https?:)?\/\/[^)]*\)/gi, "url()")
      .replace(/expression\s*\([^)]*\)/gi, "");
  }

  if (!isHtml) return;
  const html = document.documentElement;
  let head: Element | null = document.querySelector("head");
  if (!head && html) {
    head = document.createElementNS(html.namespaceURI || "http://www.w3.org/1999/xhtml", "head");
    html.insertBefore(head, html.firstChild);
  }
  if (head) {
    const meta = document.createElementNS(head.namespaceURI || "http://www.w3.org/1999/xhtml", "meta");
    meta.setAttribute("http-equiv", "Content-Security-Policy");
    meta.setAttribute("content", CSP);
    head.prepend(meta);
  }
}

export function sanitizePublicationMarkup(markup: string, mediaType = "application/xhtml+xml"): string {
  const svg = /svg/i.test(mediaType);
  const parserType: DOMParserSupportedType = svg
    ? "image/svg+xml"
    : /html/i.test(mediaType) && !/xhtml/i.test(mediaType)
      ? "text/html"
      : "application/xhtml+xml";
  const parser = new DOMParser();
  let document = parser.parseFromString(markup, parserType);

  if (!svg && document.querySelector("parsererror")) {
    document = parser.parseFromString(markup, "text/html");
  }
  sanitizeDocument(document, !svg);

  if (parserType === "text/html" || document.contentType === "text/html") {
    return `<!doctype html>\n${document.documentElement.outerHTML}`;
  }
  return new XMLSerializer().serializeToString(document);
}

function isMarkupResource(type: string, name: string): boolean {
  return /(?:html|xhtml|svg)\+?xml|text\/html/i.test(type)
    || /\.(?:xhtml?|html?|svg)$/i.test(name);
}

export async function sanitizeTransformData(
  data: string | Blob,
  type = "application/xhtml+xml",
): Promise<string | Blob> {
  if (typeof data === "string") return sanitizePublicationMarkup(data, type);
  const markup = typeof data.text === "function"
    ? await data.text()
    : await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : ""));
      reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read publication resource")));
      reader.readAsText(data);
    });
  return new Blob([sanitizePublicationMarkup(markup, type || data.type)], {
    type: data.type || type,
  });
}

export function installPublicationSanitizer(transformTarget: EventTarget | undefined): () => void {
  if (!transformTarget) return () => undefined;
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<PublicationTransformDetail>).detail;
    if (!detail || !isMarkupResource(detail.type ?? "", detail.name ?? "")) return;
    detail.data = Promise.resolve(detail.data).then((data) => sanitizeTransformData(data, detail.type));
  };
  transformTarget.addEventListener("data", handler);
  return () => transformTarget.removeEventListener("data", handler);
}
