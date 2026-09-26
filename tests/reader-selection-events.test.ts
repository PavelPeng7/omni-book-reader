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
  document.documentElement.scrollLeft = 0;
  document.documentElement.scrollTop = 0;
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
    containerPosition: 400,
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
    reader: { renderer: Object.assign(paginator, { getContents: () => [{ doc: document }] }), deselect: vi.fn() },
    fixedLayout: false, selectionPageTurnGuardUntil: 0,
    selectionTouchGestureActive: false, selectionNavigationNoticeShown: false,
    pendingSelection: null,
    captureSelection: vi.fn(), noteReadingActivity: vi.fn(),
    queuePageTurn: vi.fn(), uiState: { close: vi.fn() },
    viewerEl: { getBoundingClientRect: () => ({ left: 0, width: 400 }) },
  });
  view.attachDocumentEvents(document, 0, paginator);
  cleanups.push(() => view.cleanupCallbacks.forEach((cleanup: () => void) => cleanup()));
  return { paginator, view, settings, text, visible };
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

  it("restores both publication and paginator scroll when an active selection crosses the page boundary", () => {
    const { paginator } = setup();
    touch("touchstart", 200);
    for (let page = 1; page <= 3; page++) {
      if (page === 2) window.getSelection()!.removeAllRanges();
      document.documentElement.scrollLeft = page * 400;
      document.dispatchEvent(new Event("scroll"));
      paginator.containerPosition = 400 - page * 400;
      paginator.dispatchEvent(new Event("scroll"));
      expect(document.documentElement.scrollLeft).toBe(0);
      expect(paginator.containerPosition).toBe(400);
    }
  });

  it.each(["focus", "anchor"])("keeps the %s handle on the visible page while dragging across a split paragraph", (handle) => {
    const { view, paginator, text, visible } = setup();
    visible.setStart(text, 15);
    visible.setEnd(text, 30);
    view.reader.lastLocation = { range: visible };
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.setBaseAndExtent(text, 25, text, 20);
    touch("touchstart", 200);
    document.dispatchEvent(new Event("selectionchange"));

    if (handle === "focus") selection.setBaseAndExtent(text, 25, text, 5);
    else selection.setBaseAndExtent(text, 5, text, 25);
    document.documentElement.scrollLeft = -400;
    document.dispatchEvent(new Event("selectionchange"));

    expect(document.documentElement.scrollLeft).toBe(0);
    expect(paginator.containerPosition).toBe(400);
    expect(handle === "focus" ? selection.focusOffset : selection.anchorOffset).toBe(15);
    expect(selection.isCollapsed).toBe(false);
  });

  it("clamps a handle dragged toward the next page and leaves in-page movement alone", () => {
    const { view, text, visible } = setup();
    visible.setStart(text, 15);
    visible.setEnd(text, 30);
    view.reader.lastLocation = { range: visible };
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(text, 20, text, 25);
    touch("touchstart", 200);
    document.dispatchEvent(new Event("selectionchange"));
    expect(selection.focusOffset).toBe(25);

    selection.setBaseAndExtent(text, 20, text, 38);
    document.dispatchEvent(new Event("selectionchange"));
    expect(selection.focusOffset).toBe(30);
  });

  it.each([true, false])("uses a pending touch selection after native handle events stop (pending=%s)", (pending) => {
    const { view, text, visible } = setup();
    visible.setStart(text, 15);
    visible.setEnd(text, 30);
    view.reader.lastLocation = { range: visible };
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(text, 25, text, 5);
    view.pendingSelection = pending ? { selection } : null;
    document.dispatchEvent(new Event("selectionchange"));
    expect(selection.focusOffset).toBe(pending ? 15 : 5);
  });

  it("leaves cross-page handles alone in continuous layout", () => {
    const { view, settings, text, visible } = setup();
    visible.setStart(text, 15);
    visible.setEnd(text, 30);
    view.reader.lastLocation = { range: visible };
    settings.layout = "scrolled";
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(text, 25, text, 5);
    touch("touchstart", 200);
    document.dispatchEvent(new Event("selectionchange"));
    expect(selection.focusOffset).toBe(5);
  });

  it("allows normal paginated scrolling after the selection is cleared", () => {
    const { paginator, view } = setup();
    window.getSelection()!.removeAllRanges();
    view.selectionPageTurnGuardUntil = 0;
    paginator.containerPosition = 800;
    paginator.dispatchEvent(new Event("scroll"));
    expect(paginator.containerPosition).toBe(800);
  });

  it("does not lock the publication scroll in continuous layout", () => {
    const { paginator, settings } = setup();
    settings.layout = "scrolled";
    touch("touchstart", 200);
    document.documentElement.scrollTop = 300;
    document.dispatchEvent(new Event("scroll"));
    paginator.containerPosition = 700;
    paginator.dispatchEvent(new Event("scroll"));
    expect(document.documentElement.scrollTop).toBe(300);
    expect(paginator.containerPosition).toBe(700);
  });

  it("does not restore an old section after the paginator changes documents", () => {
    const { paginator } = setup();
    touch("touchstart", 200);
    paginator.getContents = () => [];
    paginator.containerPosition = 800;
    paginator.dispatchEvent(new Event("scroll"));
    expect(paginator.containerPosition).toBe(800);
  });

  it.each(["mouse", "pen"])("does not turn a desktop selection at the page edge with %s", (type) => {
    const { paginator, view } = setup(false);
    pointer("pointerdown", type);
    pointer("pointermove", type, 390);
    document.dispatchEvent(new Event("selectionchange"));
    pointer("pointerup", type, 390);
    vi.advanceTimersByTime(800);
    expect(paginator.next).not.toHaveBeenCalled();
    expect(paginator.prev).not.toHaveBeenCalled();
    expect(view.queuePageTurn).not.toHaveBeenCalled();
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

  it("dismisses a native selection on an outside click before allowing a page turn", () => {
    const { view } = setup(false);
    const range = window.getSelection()!.getRangeAt(0);
    range.getClientRects = () => [{ left: 10, right: 100, top: 10, bottom: 30 }] as unknown as DOMRectList;
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 200 }));
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1, clientX: 200, clientY: 200 }));
    expect(window.getSelection()!.rangeCount).toBe(0);
    expect(view.queuePageTurn).not.toHaveBeenCalled();
    view.selectionPageTurnGuardUntil = 0;
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1, clientX: 200, clientY: 200 }));
    expect(view.queuePageTurn).toHaveBeenCalledOnce();
  });

  it("keeps the selection when clicking its selected text", () => {
    const { view } = setup(false);
    const range = window.getSelection()!.getRangeAt(0);
    range.getClientRects = () => [{ left: 10, right: 100, top: 10, bottom: 30 }] as unknown as DOMRectList;
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 50, clientY: 20 }));
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1, clientX: 50, clientY: 20 }));
    expect(window.getSelection()!.rangeCount).toBe(1);
    expect(view.queuePageTurn).not.toHaveBeenCalled();
  });

  it("dismisses a touch selection on an outside tap without navigating", () => {
    const { view } = setup();
    const range = window.getSelection()!.getRangeAt(0);
    range.getClientRects = () => [{ left: 10, right: 100, top: 10, bottom: 30 }] as unknown as DOMRectList;
    touch("touchstart", 200, 200, 1000);
    touch("touchend", 200, 200, 1100);
    expect(window.getSelection()!.rangeCount).toBe(0);
    expect(view.queuePageTurn).not.toHaveBeenCalled();
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
    document.documentElement.scrollLeft = 400;
    document.dispatchEvent(new Event("scroll"));
    paginator.containerPosition = 0;
    paginator.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(800);
    expect(paginator.next).toHaveBeenCalledOnce();
    expect(document.documentElement.scrollLeft).toBe(400);
    expect(paginator.containerPosition).toBe(0);
  });
});
