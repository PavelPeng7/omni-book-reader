# Mobile Selection Navigation Lock

Status: Implementation complete; device validation pending
Issue: https://github.com/PavelPeng7/omni-book-reader/issues/3

## Scope

Prevent touch selection-handle drags from turning paginated pages on mobile while preserving desktop mouse edge-assisted selection and normal navigation after the selection is saved or cancelled.

## Acceptance criteria

- Touch selection-edge navigation is blocked even when the native range briefly collapses.
- Ordinary navigation inputs remain blocked while native, pending, or settling selection state exists.
- The first blocked navigation attempt for a selection shows guidance; later attempts for the same selection stay quiet.
- Saving or cancelling the selection resets the guidance and restores navigation immediately.
- Desktop mouse edge-assisted selection and scrolled-layout behavior remain unchanged.
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
- 2026-09-16: final `npm test` passed (21 files and 66 tests; 1 fixture test skipped by its existing condition).
- 2026-09-16: one earlier full-suite run exposed a timing failure in the unrelated Foliate iframe test; its focused rerun and the final full-suite run passed.
- 2026-09-16: `npm run build` and `npm run validate:release` passed; release 0.9.3 artifacts validated.
- 2026-09-16: `npm run verify:full` could not start its nested npm command because Node.js 24.14.1 on Windows raised `spawn EINVAL`; every component gate was run directly as recorded above.
- Pending: Android and iOS manual selection-handle verification in Obsidian mobile.
