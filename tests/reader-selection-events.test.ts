import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  FileView: class {}, Modal: class {}, PluginSettingTab: class {},
  Platform: { isMobile: true },
}));
vi.mock("../src/epub-cover", () => ({}));
vi.mock("../src/epub-loader", () => ({}));

import { Platform } from "obsidian";
import { OmniBookReaderView } from "../src/reader-view";

// Execute the installed dependency's actual selection handlers. Only private
// field access is exposed; layout is supplied as a visible DOM Range because
// jsdom cannot paginate or drive Android's native selection handles.
const paginatorSource = readFileSync("node_modules/foliate-js/paginator.js", "utf8");
const debounceSource = paginatorSource.slice(paginatorSource.indexOf("const debounce ="), paginatorSource.indexOf("const lerp ="));
const selectionSource = paginatorSource.slice(
  paginatorSource.indexOf("        const checkPointerSelection ="),
  paginatorSource.indexOf("        this.#mediaQueryListener ="),
).replaceAll("this.#lastVisibleRange", "this.visibleRange")
  .replaceAll("this.#scrollToAnchor", "this.scrollToAnchor");
const selectionDirectionSource = paginatorSource.slice(
  paginatorSource.indexOf("const selectionIsBackward ="), paginatorSource.indexOf("const setSelectionTo ="),
);

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup(mobile = true, backward = false) {
  vi.useFakeTimers();
  Platform.isMobile = mobile;
  const paragraph = document.createElement("p");
  paragraph.textContent = "First page text followed by the next page text";
  document.body.append(paragraph);
  const text = paragraph.firstChild!;
  const visible = document.createRange();
  visible.setStart(text, 0);
  visible.setEnd(text, 15);
  const selected = document.createRange();
  selected.setStart(text, 3);
  selected.setEnd(text, 25);
  window.getSelection()!.addRange(selected);
  if (backward) window.getSelection()!.setBaseAndExtent(text, 25, text, 0);
  if (backward) visible.setStart(text, 3);
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(400);

  const paginator = Object.assign(new EventTarget(), {
    visibleRange: visible, scrolled: false,
    prev: vi.fn(), next: vi.fn(), scrollToAnchor: vi.fn(),
  });
  new Function(`${debounceSource}\n${selectionDirectionSource}\n${selectionSource}`).call(paginator);
  // Foliate installs its listeners before the plugin receives the load event.
  // Track and remove them because this harness reuses the jsdom document.
  const nativeAdd = document.addEventListener.bind(document);
  const spy = vi.spyOn(document, "addEventListener").mockImplementation((type, listener, options) => {
    nativeAdd(type, listener, options);
    cleanups.push(() => document.removeEventListener(type, listener, options));
  });
  paginator.dispatchEvent(new CustomEvent("load", { detail: { doc: document } }));
  spy.mockRestore();

  // Skip Obsidian view construction while executing the real event wiring and
  // selection policy methods on its prototype.
  const settings = { layout: "paginated", tapToTurnPages: true };
  const view = Object.assign(Object.create(OmniBookReaderView.prototype), {
    attachedDocuments: new WeakSet(), cleanupCallbacks: [],
    plugin: { getReaderSettings: () => settings },
    reader: { renderer: { getContents: () => [{ doc: document }] } },
    fixedLayout: false, selectionPageTurnGuardUntil: 0,
    selectionTouchGestureActive: false, selectionNavigationNoticeShown: false,
    pendingSelection: null,
    captureSelection: vi.fn(), noteReadingActivity: vi.fn(),
    turnPageWhileSelecting: vi.fn(),
    queuePageTurn: vi.fn(),
  });
  view.attachDocumentEvents(document, 0);
  cleanups.push(() => view.cleanupCallbacks.forEach((cleanup: () => void) => cleanup()));
  return { paginator, view, settings };
}

function pointer(type: string, pointerType: string, x = 200, y = 200) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerType, buttons: 1, clientX: x, clientY: y });
  document.dispatchEvent(event);
}

function touch(type: string, y: number, x = 200, time = 1000) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y };
  Object.defineProperties(event, {
    touches: { value: type === "touchend" ? [] : [point] },
    changedTouches: { value: { item: () => point } },
    timeStamp: { value: time },
  });
  document.dispatchEvent(event);
  return event;
}

describe("reader selection event arbitration", () => {
  it.each([false, true])("keeps Android vertical handle selection on the current page through release (backward=%s)", (backward) => {
    const { paginator, view } = setup(true, backward);
    pointer("pointerdown", "touch");
    pointer("pointermove", "touch", 200, 80);
    document.dispatchEvent(new Event("selectionchange"));
    pointer("pointerup", "touch", 200, 80);
    vi.advanceTimersByTime(800);
    expect(paginator.next).not.toHaveBeenCalled();
    expect(paginator.prev).not.toHaveBeenCalled();
    expect(view.captureSelection).toHaveBeenCalled();
  });

  it("does not repeatedly turn while the handle remains held", () => {
    const { paginator } = setup();
    pointer("pointerdown", "touch");
    for (let y = 200; y > 0; y -= 50) {
      pointer("pointermove", "touch", 200, y);
      document.dispatchEvent(new Event("selectionchange"));
      vi.advanceTimersByTime(800);
    }
    expect(paginator.next).not.toHaveBeenCalled();
    expect(paginator.prev).not.toHaveBeenCalled();
  });

  it.each(["mouse", "pen", ""])("does not start desktop edge assistance on mobile for pointer type %s", (type) => {
    const { view } = setup();
    pointer("pointermove", type, 390);
    vi.advanceTimersByTime(600);
    expect(view.turnPageWhileSelecting).not.toHaveBeenCalled();
  });

  it("retains desktop mouse edge assistance", () => {
    const { view } = setup(false);
    pointer("pointermove", "mouse", 390);
    vi.advanceTimersByTime(600);
    expect(view.turnPageWhileSelecting).toHaveBeenCalledWith("next");
  });

  it("keeps collapsed vertical touch drags away from downstream touch pagination", () => {
    const { view } = setup();
    const downstream = vi.fn();
    document.addEventListener("touchmove", downstream);
    document.addEventListener("touchend", downstream);
    cleanups.push(() => {
      document.removeEventListener("touchmove", downstream);
      document.removeEventListener("touchend", downstream);
    });
    touch("touchstart", 200);
    window.getSelection()!.removeAllRanges();
    // Even after the settling timer expires, a held handle owns the gesture.
    vi.advanceTimersByTime(2000);
    const move = touch("touchmove", 80);
    touch("touchend", 80);
    expect(downstream).not.toHaveBeenCalled();
    expect(move.defaultPrevented).toBe(false);
    expect(view.queuePageTurn).not.toHaveBeenCalled();
  });

  it("allows an ordinary swipe without a selection", () => {
    const { view } = setup();
    window.getSelection()!.removeAllRanges();
    touch("touchstart", 200, 250, 1000);
    touch("touchend", 200, 100, 1200);
    expect(view.queuePageTurn).toHaveBeenCalledWith("next");
  });

  it("does not intercept selectionchange in scrolled layout", () => {
    const { settings } = setup();
    settings.layout = "scrolled";
    const downstream = vi.fn();
    document.addEventListener("selectionchange", downstream);
    cleanups.push(() => document.removeEventListener("selectionchange", downstream));
    document.dispatchEvent(new Event("selectionchange"));
    expect(downstream).toHaveBeenCalledOnce();
  });

  it("removes the capture guard when the reader document detaches", () => {
    const { view, paginator } = setup();
    view.cleanupCallbacks.forEach((cleanup: () => void) => cleanup());
    pointer("pointerdown", "touch");
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(800);
    expect(paginator.next).toHaveBeenCalledOnce();
  });
});
