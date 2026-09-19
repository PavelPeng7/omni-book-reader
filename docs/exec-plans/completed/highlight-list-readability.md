# Highlight List Readability

Status: Complete
Issue: https://github.com/PavelPeng7/omni-book-reader/issues/7

## Scope

Make the narrow reader sidebar's 摘录 list prioritize selected text without changing annotation persistence, selection-navigation behavior, filters, exports, or EPUB handling.

## Acceptance criteria

- Long 摘录 text is bounded to four readable lines without horizontal overflow.
- A list entry retains one edit action; deletion stays available in the edit flow.
- Clicking a 摘录 continues to navigate to its saved original location.
- Existing annotation filters, sorting, tags, notes, stale indication, and export actions remain available.

## Test seam

Extend the existing reader-sidebar CSS contract test. It observes the stable rendering classes and their user-visible layout behavior without coupling to private reader-view methods. Type-checking covers the removal of the redundant list deletion action.

## Steps

1. Add a failing CSS-contract regression for four-line 摘录 text and overflow protection.
2. Make the minimum list presentation and action changes to satisfy the regression.
3. Run focused tests and type-checking; inspect the final diff against Issue #7.
4. Run full verification, record the result, complete the execution record, and commit the scoped changes.

## Risks

- The repository has unrelated uncommitted UI work. Keep the implementation and commit limited to the Issue #7 files and avoid altering unrelated hunks.
- CSS rules are layered; the final cascade must be inspected so the intended rule wins in the reader sidebar.

## Validation log

- 2026-09-19: `npx vitest run tests/mobile-sidebar-styles.test.ts` passed (3 tests) after the initial four-line 摘录 regression failed as expected.
- 2026-09-19: `npm run check` and `npm run lint` passed.
- 2026-09-19: `npm test` passed (21 test files, 68 tests; 1 existing fixture skipped).
- 2026-09-19: `npm run build` and `npm run validate:release` passed; release 0.9.5 artifacts validated.
- 2026-09-19: `npm run verify:quick` and `npm run verify:full` could not spawn their nested npm child process under the current Windows Node.js 24.14.1 runtime (`spawn EINVAL`). Their component gates were run directly as recorded above.
- 2026-09-19: Two-axis review against `bc73a5a...5109a06` found duplicated clamp declarations and a DOM-level interaction coverage gap. The declarations were consolidated; the existing highest stable sidebar CSS contract seam remains the regression test because the current test harness cannot instantiate the Reader view without broad unrelated test infrastructure.
- 2026-09-19: Final focused test, lint, type-check, full test suite, production build, and release validation passed (21 test files and 68 tests; 1 existing fixture skipped).
