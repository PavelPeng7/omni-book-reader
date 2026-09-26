# Android Selection Scroll Lock

Status: Implementation and automated verification complete; native Android validation pending under TD-2026-001
Date: 2026-09-26

## Scope

Prevent Android selection-handle drags across a paginated paragraph boundary from moving the publication viewport or Foliate's page container while selection protection is enabled.

## Acceptance criteria

- A held selection can cross a page boundary without moving the current page, including repeated upward movement.
- Scrolled layout, disabled selection protection, and ordinary page navigation retain their existing behavior.
- Event listeners are removed with the publication document.

## Steps and validation

1. Reproduce repeated scroll movement in the reader event harness.
2. Restore the document and paginator positions during protected selection gestures.
3. Run focused tests, quick verification, and full verification.
4. Record the runtime decision and native-device validation limit.

## Progress

- `npx vitest run tests/reader-selection-events.test.ts` failed on repeated publication scroll during an active touch selection (13 passed, 1 failed).
- The fix uses document scroll capture and Foliate's forwarded scroll event plus `containerPosition` to restore the touch-start position. The renderer is passed directly through the load callback because `this.reader` is assigned after the document load event.
- Event tests cover repeated scroll, transient collapse, disabled protection, continuous layout, cleared selection, cleanup, and an old chapter receiving a forwarded renderer scroll.
- `npm run verify:quick` passed after the final chapter boundary guard (90 passed, 1 existing skipped).
- `npm run verify:full` passed after the final code and documentation changes (90 passed, 1 existing skipped; production build and release asset validation passed).
- Native Android selection handles are not available in jsdom; device confirmation remains required.
