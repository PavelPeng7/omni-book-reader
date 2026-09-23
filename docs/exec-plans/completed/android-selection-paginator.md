# Android selection paginator arbitration

Status: Implementation and automated verification complete; native Android validation tracked in TD-2026-001
Date: 2026-09-23

## Scope and acceptance

User reports vertical selection-handle drags on Android causing page turns away from horizontal edges. Selection must remain on the current page through release; cross-page highlights are made separately. Preserve desktop mouse edge assistance and ordinary navigation after saving/cancelling.

## Steps

1. Build an event-level regression using the installed Foliate selection handlers and the reader's document handlers.
2. Identify which automatic-navigation path bypasses the selection lock and apply a scoped fix.
3. Verify mobile selection, desktop assistance, lifecycle cleanup, and existing navigation policy tests.
4. Update design/specification and run `npm run verify:quick` and `npm run verify:full`.

## Risks and limits

- Native Android selection handles cannot be reproduced by jsdom; simulated event ordering establishes code-path coverage, not device acceptance.
- Existing unrelated working-tree changes must be preserved.
- Foliate has its own selection and touch navigation; plugin-level page-turn checks alone may not cover it.

## Progress

- User approved investigation and repair scope; mobile platform and desired cross-page behavior confirmed.
- Reproduction: `npx vitest run tests/reader-selection-events.test.ts` failed because Foliate `next()` was called once after a centered vertical touch-pointer selection and release. The harness executes the installed dependency's handlers with a supplied visible range.
- Cause: Foliate treats touch pointerdown as pointer selection; selectionchange schedules navigation directly, bypassing the plugin lock. A capture-phase mobile paginated guard prevents scheduling without cancelling native selection.
- Also restricted plugin edge assistance to desktop mouse input outside a touch-selection gesture.
- Focused validation: `npx vitest run tests/reader-selection-events.test.ts tests/mobile-input.test.ts` passed, 29 tests.
- `npm run verify:quick` passed: lint, TypeScript, 82 tests passed and 1 existing fixture test skipped.
- `npm run verify:full` passed: the same verification gates, production bundle, and release asset validation for 1.0.1. Local `main.js` regenerated; no release published.
- Native acceptance still required on Android: long-press a passage, drag both handles up/down in the middle of a page and hold beyond 700 ms, release, save/cancel, and check normal page turns resume. Cross-page highlights remain separate. Track device-only coverage under TD-2026-001.
