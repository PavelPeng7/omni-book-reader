# Reader Selection and Navigation

Status: Accepted
Date: 2026-08-28

## Context

The reader combines browser-native text selection with Foliate pagination. The same gesture stream can represent a tap, swipe, long press, selection-handle drag, edge-assisted selection, or Foliate's own touch snap. Browser selection may briefly collapse while a handle is moving, and section navigation replaces the active publication document.

This makes selection/navigation bugs timing-sensitive. A check performed only after navigation cannot prevent viewport flashes, lost selections, or accidental chapter changes.

## Interaction invariants

1. Native or pending text selection owns navigation input until selection state has settled.
2. A selection gesture must not be reinterpreted as a tap, swipe, key, wheel, or hardware-button page turn.
3. Edge-assisted selection may move between pages inside one EPUB spine section.
4. Edge-assisted selection must stop before crossing into another spine section. The current selection remains active so the user can save it before continuing in the next chapter.
5. Navigation eligibility is decided before invoking `goLeft`, `goRight`, `prev`, `next`, or `goTo` when the required state is available.
6. A post-navigation section check is a fallback for dependency/runtime uncertainty, not the primary guard.
7. Physical left/right direction must be mapped through the publication's LTR/RTL reading direction before reasoning about previous/next sections.
8. Normal navigation behavior remains unchanged when no selection state is active.

## Current implementation boundary

- `src/reader-view.ts` owns document event coordination, selection capture, page-turn queuing, and Foliate calls.
- `src/mobile-input.ts` owns pure gesture and direction decisions that can be tested without Obsidian or an iframe.
- `src/types.ts` declares the Foliate surface used by the plugin.
- `tests/mobile-input.test.ts` covers the pure decision matrix.

Keep timing-free decisions in `mobile-input.ts`. Do not add more event-policy arithmetic directly to the reader view when it can be expressed as a small pure function.

## Chapter-boundary preflight

For the pinned `foliate-js` paginator, `page` and `pages` expose the current rendered page and total pages. In paginated reflowable content, page `1` is the first content page and `pages - 2` is the last content page. Before an edge-assisted selection turn:

- a backward logical turn at page `1` would leave the current section;
- a forward logical turn at page `pages - 2` would leave the current section;
- interior pages may turn normally;
- unavailable or invalid paginator state falls through to the existing post-navigation section check.

This assumption is dependency-specific. When upgrading `foliate-js`, inspect its paginator implementation and manually verify first/last-page behavior before accepting the upgrade. Do not assume undocumented behavior remains stable across versions.

## Direction mapping

Selection edges produce physical directions:

| Publication direction | Physical left | Physical right |
| --- | --- | --- |
| LTR | Logical backward | Logical forward |
| RTL | Logical forward | Logical backward |

Tests must express both physical direction and publication direction. A test suite that covers only LTR can pass while RTL chapter boundaries remain reversed.

## Required regression matrix

For changes involving selection or navigation, cover the applicable rows:

| State | Required expectation |
| --- | --- |
| No selection | Tap, swipe, key, wheel, and enabled hardware controls navigate normally |
| Native selection active | All ordinary page-turn inputs are blocked |
| Pending annotation selection | Navigation remains blocked even if the native range briefly collapses |
| Selection settling guard | Synthetic click/touch follow-up does not navigate |
| Interior page, LTR | Left/right edge assistance stays in the current section |
| First/last page, LTR | Boundary edge assistance does not call navigation |
| Interior page, RTL | Physical directions map to the correct logical turn |
| First/last page, RTL | Boundary edge assistance does not call navigation |
| Missing paginator state | Compatibility fallback preserves or restores the original section |
| Scrolled or fixed layout | Paginated edge-assistance rules are not applied accidentally |

Pure-function tests are necessary but do not fully model browser-native selection handles. Before release, manually exercise at least one multi-page chapter boundary in Obsidian desktop and mobile when the change touches touch events, selection timing, Foliate pagination, or iframe document replacement.

## Failure patterns to avoid

- Navigate first, detect the section change afterward, then jump back.
- Check only `Selection.isCollapsed`; handle gestures can temporarily collapse the range.
- Let Foliate's touch snap and plugin-level gesture handling both own the same completed gesture.
- Treat physical right as logical next without consulting the book direction.
- Disable all edge assistance to fix one boundary case; preserve valid same-section selection behavior.

## Related records

- Product behavior: [`../../product-specs/index.md`](../../product-specs/index.md)
- Original execution record: [`../../exec-plans/completed/chapter-boundary-selection.md`](../../exec-plans/completed/chapter-boundary-selection.md)
- Remaining automation gap: [`../../exec-plans/tech-debt.md`](../../exec-plans/tech-debt.md)
