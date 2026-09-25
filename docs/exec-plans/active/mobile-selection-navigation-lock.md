# Mobile Selection Navigation Lock

Status: Implementation complete; device validation pending
Issue: https://github.com/PavelPeng7/omni-book-reader/issues/3

## Scope

Prevent touch selection-handle drags from turning paginated pages on mobile while preserving normal navigation after the selection is saved or cancelled. Desktop edge assistance was removed by [`selection-never-turns-pages.md`](../completed/selection-never-turns-pages.md) after the user requested that selection never trigger pagination.

## Acceptance criteria

- Touch selection-edge navigation is blocked even when the native range briefly collapses.
- Ordinary navigation inputs remain blocked while native, pending, or settling selection state exists.
- The first blocked navigation attempt for a selection shows guidance; later attempts for the same selection stay quiet.
- Saving or cancelling the selection resets the guidance and restores navigation immediately.
- Scrolled-layout behavior remains unchanged. Desktop selection-edge navigation is superseded by the newer product requirement.
- Product and system design documentation describe the resulting behavior.

## Risks

- Native selection event ordering differs between Android and iOS and cannot be reproduced faithfully in jsdom.
- The working tree contains unrelated user changes; implementation and commit paths must stay narrowly scoped.
- The repository verification wrapper currently fails to spawn child processes under the installed Node.js 24 Windows runtime, so its component commands may need to be recorded separately.

## Steps

1. Add a failing policy-level regression test at the agreed selection-navigation seam.
2. Implement the minimum navigation arbitration needed to pass it.
3. Add notice lifecycle coverage and wire the policy into reader input handling.
4. Update product and selection/navigation documentation.
5. Run focused tests, type-checking, the full suite, and full release gates.
6. Review the completed diff against repository standards and Issue #3.

## Validation log

- 2026-09-16: `npx vitest run tests/mobile-input.test.ts` passed (15 tests).
- 2026-09-16: `npm run lint` passed.
- 2026-09-16: `npm run check` passed.
- 2026-09-17: final `npm run lint`, `npm run check`, `npm test`, `npm run build`, and `npm run validate:release` passed after all review fixes (21 test files and 67 tests passed; 1 fixture test skipped by its existing condition; release 0.9.3 validated).
- 2026-09-16: one earlier full-suite run exposed a timing failure in the unrelated Foliate iframe test; its focused rerun and the final full-suite run passed.
- 2026-09-16: `npm run build` and `npm run validate:release` passed; release 0.9.3 artifacts validated.
- 2026-09-17: `npm run verify:full` could not start its nested npm command because both Node.js 24.14.1 and supported Node.js 20.20.2 raised `spawn EINVAL` when launching `npm.cmd` on this Windows environment; every component gate was run directly as recorded above.
- 2026-09-17: two-axis review found ordinary button navigation and transient-collapse gaps; both were fixed, the policy matrix was expanded, and architecture documentation was synchronized.
- 2026-09-17: follow-up review found a prolonged native-selection collapse could outlive the time guard while the finger remained down; an explicit touch-selection-gesture state now keeps the shared navigation lock active until touch end or cancellation.
- 2026-09-20: follow-up reproduced a remaining gap where the native range collapsed during an upward selection-handle drag; the touchmove was not consumed and Foliate could replay it as one or more backward page turns. Mobile selection gestures now retain ownership through transient collapse and no longer schedule touch edge turns.
- 2026-09-20: restored click-outside dismissal for pending selections; the click is consumed after clearing the native and pending selection so it cannot immediately become a page turn.
- Pending: Android and iOS manual selection-handle verification in Obsidian mobile, including upward drags that previously caused repeated backward page turns.
