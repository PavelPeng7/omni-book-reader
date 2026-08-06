import type { InterfaceLanguage } from "./types";

export function uiText(language: InterfaceLanguage, zh: string, en: string): string {
  return language === "en" ? en : zh;
}

export function uiLocale(language: InterfaceLanguage): string {
  return language === "en" ? "en-US" : "zh-CN";
}
