import type { FoliateViewElement } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "foliate-view": FoliateViewElement;
  }
}

export {};
