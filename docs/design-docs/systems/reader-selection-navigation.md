# Reader Selection and Navigation

Status: Accepted
Date: 2026-08-28

## Context

The reader combines browser-native text selection with Foliate pagination. The same gesture stream can represent a tap, swipe, long press, selection-handle drag, or Foliate's own touch snap. Browser selection may briefly collapse while a handle is moving, and section navigation replaces the active publication document.

This makes selection/navigation bugs timing-sensitive. A check performed only after navigation cannot prevent viewport flashes, lost selections, or accidental chapter changes.

## Interaction invariants

1. With `preventPageTurnsWhileSelecting` enabled (the default), native or pending text selection owns navigation input until selection state has settled.
2. With protection enabled, a selection gesture must not be reinterpreted as a tap, swipe, key, wheel, or hardware-button page turn.
3. With protection enabled, touch selection-handle drags never turn pages. The entire touch gesture remains owned by selection even when the browser temporarily reports a collapsed range or the handle moves vertically; mobile readers select cross-page content as separate highlights, which may be joined by the existing adjacent-highlight behavior.
4. With protection enabled, desktop mouse or pen selection stays on the current page, including at the viewport edge. Cross-page passages are saved as separate selections. With protection disabled, Foliate receives selection changes and can paginate from them.
5. Navigation eligibility is decided before invoking `goLeft`, `goRight`, `prev`, `next`, or `goTo` when the required state is available.
6. A post-navigation section check is a fallback for dependency/runtime uncertainty, not the primary guard.
7. Ordinary physical left/right navigation still follows the publication's LTR/RTL reading direction.
8. Normal navigation behavior remains unchanged when no selection state is active.
9. A click outside the pending text selection dismisses the selection and consumes that click; clicking within the selection does not dismiss it.

## Current implementation boundary

- `src/reader-view.ts` owns document event coordination, selection capture, page-turn queuing, and Foliate calls.
- `src/mobile-input.ts` owns pure gesture and direction decisions that can be tested without Obsidian or an iframe.
- `src/types.ts` declares the Foliate surface used by the plugin.
- `tests/mobile-input.test.ts` covers the pure decision matrix.

Keep timing-free decisions in `mobile-input.ts`. Do not add more event-policy arithmetic directly to the reader view when it can be expressed as a small pure function.

## Foliate selectionchange arbitration (2026-09-25)

Foliate 1.0.1 sets its internal pointer-selection flag for every `pointerdown`, including touch. Its document `selectionchange` listener schedules a debounced `prev()`/`next()` after 700 ms when the selection extends beyond the visible range. This path neither requires proximity to a horizontal edge nor calls the plugin's page-turn policy, and its queued callback can run after pointer release.

For reflowable paginated documents with protection enabled, the plugin handles `selectionchange` in capture phase: it updates its own selection guard and schedules annotation capture, then stops immediate propagation before Foliate's bubble listener can schedule navigation. On mobile this applies throughout pagination; on desktop it applies while a selection is active or settling. It does not cancel the native selection default action. With protection disabled, Foliate receives the event on both platforms. The guard is scoped to each attached publication document, consults current settings and layout, and is removed on cleanup. Fixed-layout and scrolled documents retain their existing propagation.

The plugin no longer schedules page turns from mouse selection at viewport edges. All ordinary page-turn entry points continue to consult the shared selection guard.

## Publication scroll lock during selection (2026-09-26)

An Android selection handle can reach the start of a paragraph that continues from a previous paginated page. During the held drag, native selection scrolling can change the EPUB document viewport or Foliate's page container without calling the plugin's page-turn methods. This is distinct from Foliate's `selectionchange` navigation and touch-end snap.

The reader snapshots the publication document's root/body scroll offsets and Foliate's `containerPosition` at touch start. While protected paginated selection owns input, document scroll and the renderer's forwarded scroll events restore those offsets. The lock survives a transiently collapsed native range through the existing touch gesture state. Foliate uses a closed shadow root, so the plugin listens to its public forwarded `scroll` event and uses its public `containerPosition` accessor rather than reaching inside the container. The restore applies only while the document is current in the renderer, since older chapter listeners remain until reader cleanup. Scrolled and fixed layouts, disabled protection, and navigation after the selection clears do not use the lock. Listeners are removed with the publication document.

The event harness simulates repeated cross-page scroll attempts and temporary range collapse. It cannot establish that a specific Android WebView emits every native selection scroll event before painting; device validation remains required.

`tests/reader-selection-events.test.ts` executes the installed Foliate selection-listener code with its private visible-range field exposed to a DOM fixture, alongside the real reader document handlers. It covers forward/backward range extension, held/released gestures, collapsed touch moves, desktop mouse and pen selection, ordinary swipes, and cleanup. This proves event-path arbitration; jsdom does not prove native selection-handle behavior.

## Required regression matrix

For changes involving selection or navigation, cover the applicable rows:

| State | Required expectation |
| --- | --- |
| No selection | Tap, swipe, key, wheel, and enabled hardware controls navigate normally |
| Native selection active | All ordinary page-turn inputs are blocked |
| Pending annotation selection | Navigation remains blocked even if the native range briefly collapses |
| Selection settling guard | Synthetic click/touch follow-up does not navigate |
| Pending selection, click outside selection | Pending selection is dismissed without turning the page |
| Touch selection handle, any page | Holding or dragging at either viewport edge does not navigate |
| Touch selection handle, vertical movement | Moving a handle toward the top or bottom does not invoke Foliate pagination or repeat page turns |
| Touch selection crossing a paragraph/page boundary | Repeated document or paginator scroll attempts restore the current page throughout the drag |
| Mouse or pen selection, any page or edge | Dragging never calls plugin or Foliate pagination |
| Protection disabled, selection active | Foliate receives `selectionchange`, and plugin page-turn policy does not block solely for selection |
| Scrolled or fixed layout | Paginated edge-assistance rules are not applied accidentally |

Pure-function tests are necessary but do not fully model browser-native selection handles. Before release, manually exercise selection drags in Obsidian desktop and mobile when the change touches touch events, selection timing, Foliate pagination, or iframe document replacement.

## Failure patterns to avoid

- Navigate first, detect the section change afterward, then jump back.
- Check only `Selection.isCollapsed`; handle gestures can temporarily collapse the range.
- Let Foliate's touch snap and plugin-level gesture handling both own the same completed gesture.
- Allow either the plugin or Foliate to interpret selection drags as page-turn gestures.

## Related records

- Product behavior: [`../../product-specs/index.md`](../../product-specs/index.md)
- Original execution record: [`../../exec-plans/completed/chapter-boundary-selection.md`](../../exec-plans/completed/chapter-boundary-selection.md)
- Remaining automation gap: [`../../exec-plans/tech-debt.md`](../../exec-plans/tech-debt.md)
