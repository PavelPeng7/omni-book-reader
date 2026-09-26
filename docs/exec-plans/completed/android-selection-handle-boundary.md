# Android Selection Handle Boundary

Status: Implementation and automated verification complete; native Android validation pending under TD-2026-001
Date: 2026-09-26

## Scope

Keep both native selection handles inside the visible page when a held Android selection crosses a paragraph split across paginated pages. Preserve the existing page scroll lock and ordinary selection behavior.

## Acceptance criteria

- Dragging either selection endpoint into the previous or next page clamps that endpoint to the current page boundary.
- Selection remains non-collapsed when one endpoint remains on the page.
- In-page selection, disabled protection, and continuous layout retain their existing behavior.
- Existing page-turn and scroll-lock regressions pass.

## Steps

1. Reproduce the off-page native selection endpoint in the reader event harness.
2. Clamp only a held, protected selection against Foliate's visible range.
3. Update product and design records, then run focused, quick, and full verification.

## Progress

- `npx vitest run tests/reader-selection-events.test.ts` reproduces both focus-handle and anchor-handle escape while the viewport remains locked (2 failed, 17 passed).
- The reader now clamps active mobile selection endpoints against Foliate's visible text range before restoring the scroll position. Focused event tests pass (24 tests), covering both handles, both page directions, in-page movement, pending selection, disabled protection, and continuous layout.
- `npm run verify:quick` and `npm run verify:full` passed (97 tests passed, 1 existing fixture test skipped; production build and release asset validation passed).
- Android native handle validation is still required under TD-2026-001.
