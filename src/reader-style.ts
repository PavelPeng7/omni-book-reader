import type { ReaderSettings } from "./types";

export type ResolvedTheme = "light" | "dark" | "sepia";

export function resolveTheme(settings: ReaderSettings): ResolvedTheme {
  if (settings.theme !== "auto") return settings.theme;
  return document.body.classList.contains("theme-dark") ? "dark" : "light";
}

export function buildPublicationCss(settings: ReaderSettings): string {
  const theme = resolveTheme(settings);
  const hostStyle = getComputedStyle(document.body);
  const hostValue = (name: string, fallback: string): string => {
    const value = hostStyle.getPropertyValue(name).trim();
    return value && !value.includes("var(") ? value : fallback;
  };
  const colors = theme === "dark"
      ? { background: "#19231d", foreground: "#e6e8e1", link: "#a9b7a1", selection: "rgba(169, 183, 161, .30)" }
    : theme === "sepia"
      ? { background: "#f3ead7", foreground: "#44382a", link: "#76591f", selection: "rgba(204, 164, 82, .35)" }
      : { background: "#f9f8f4", foreground: "#2d3a31", link: "#6f806a", selection: "rgba(140, 154, 132, .30)" };
  const obsidianFont = hostStyle.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  const fontFamily = settings.font === "obsidian"
    ? obsidianFont
    : settings.font === "serif"
      ? '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", STSong, SimSun, Georgia, serif'
    : settings.font === "sans"
      ? '"Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
      : "";
  const baseFontSize = hostValue("--font-text-size", hostValue("--editor-font-size", hostStyle.fontSize || "16px"));
  const monospaceFont = hostValue("--font-monospace", 'ui-monospace, "SFMono-Regular", Consolas, monospace');
  const scale = settings.fontSizePercent / 100;
  const fontOverrides = fontFamily ? `
    html, body { font-family: ${fontFamily} !important; }
    body :is(article, section, main, aside, header, footer, nav, p, div, span, li, dd, dt, blockquote, figcaption, td, th, caption, label, legend) {
      font-family: inherit !important;
    }
    body :is(h1, h2, h3, h4, h5, h6) { font-family: inherit !important; }
  ` : "";

  return `
    :root {
      color-scheme: ${theme === "dark" ? "dark" : "light"};
      --pavel-reader-font-size: calc(${baseFontSize} * ${scale});
      --pavel-reader-line-height: ${settings.lineHeight};
      --pavel-reader-letter-spacing: ${settings.letterSpacing}em;
      --pavel-reader-paragraph-spacing: ${settings.paragraphSpacing}em;
      --pavel-reader-monospace-font: ${monospaceFont};
    }
    html, body {
      background: ${colors.background} !important;
      color: ${colors.foreground} !important;
      max-inline-size: 100% !important;
      min-inline-size: 0 !important;
      box-sizing: border-box !important;
    }
    html {
      font-size: var(--pavel-reader-font-size) !important;
      line-height: var(--pavel-reader-line-height) !important;
      letter-spacing: var(--pavel-reader-letter-spacing) !important;
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }
    body {
      font-size: inherit !important;
      line-height: inherit !important;
      letter-spacing: inherit !important;
      text-rendering: optimizeLegibility;
      font-kerning: normal;
      -webkit-font-smoothing: antialiased;
      -webkit-touch-callout: default;
      -webkit-user-select: text;
      user-select: text;
      overflow-wrap: anywhere;
      word-break: normal;
      line-break: auto;
    }
    body :is(article, section, main, aside, header, footer, nav, p, div, span, li, dd, dt, blockquote, figcaption, td, th, caption, label, legend) {
      font-size: inherit !important;
      letter-spacing: inherit !important;
      box-sizing: border-box;
    }
    body :is(p, li, dd, dt, blockquote, figcaption) {
      line-height: inherit !important;
      text-wrap: pretty;
      orphans: 2;
      widows: 2;
    }
    ${fontOverrides}
    body :is(p, li, dd, blockquote) {
      margin-block-start: 0 !important;
      margin-block-end: var(--pavel-reader-paragraph-spacing) !important;
    }
    body :is(h1, h2, h3, h4, h5, h6) {
      margin-block-start: 1.15em;
      margin-block-end: .55em;
      line-height: 1.35 !important;
      text-wrap: balance;
      break-after: avoid;
      orphans: 2;
      widows: 2;
    }
    body :is(p, div, span, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6, td, th, caption, label, legend) {
      color: inherit;
    }
    body :is(a, a:link, a:visited) {
      color: ${colors.link} !important;
      font-family: inherit !important;
      font-size: inherit !important;
      text-underline-offset: .14em;
    }
    body ::selection { background: ${colors.selection} !important; }
    body :is(img, svg, video, canvas) {
      max-width: 100% !important;
      height: auto !important;
      break-inside: avoid;
    }
    body :is(figure, table) { max-inline-size: 100% !important; break-inside: avoid; }
    body table { border-collapse: collapse; overflow-wrap: anywhere; }
    body :is(th, td) { max-inline-size: 100%; }
    body :is(pre, code, kbd, samp) {
      font-family: var(--pavel-reader-monospace-font) !important;
      white-space: pre-wrap !important;
      word-break: break-word;
    }
    pre { max-inline-size: 100%; overflow-x: auto; overflow-wrap: anywhere; -webkit-overflow-scrolling: touch; }
    body :is(ruby, rt, rp) { letter-spacing: normal; }
    body :is(sup, sub) { line-height: 0; }
    body :is([role="doc-noteref"], a[epub\\:type~="noteref"]) {
      white-space: nowrap;
      text-decoration: none;
    }
    @media (max-width: 480px) {
      body :is(h1, h2, h3, h4, h5, h6) { text-wrap: wrap; }
      body :is(table, pre) { font-size: .9em; }
    }
    body.pavel-epub-focus-mode p,
    body.pavel-epub-focus-mode li,
    body.pavel-epub-focus-mode blockquote,
    body.pavel-epub-focus-mode pre,
    body.pavel-epub-focus-mode h1,
    body.pavel-epub-focus-mode h2,
    body.pavel-epub-focus-mode h3,
    body.pavel-epub-focus-mode h4,
    body.pavel-epub-focus-mode h5,
    body.pavel-epub-focus-mode h6 {
      opacity: .18;
      transition: opacity .18s ease, background-color .18s ease, box-shadow .18s ease;
    }
    body.pavel-epub-focus-mode .pavel-epub-focused-paragraph {
      opacity: 1 !important;
      background: ${colors.selection};
      box-shadow: 0 0 0 .45em ${colors.selection};
      border-radius: .2em;
    }
    body.pavel-epub-focus-mode .pavel-epub-focused-paragraph * {
      opacity: 1 !important;
    }
  `;
}
