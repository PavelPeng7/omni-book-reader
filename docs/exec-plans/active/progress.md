# Active Work Progress

This file is the compact project-level checkpoint. Detailed multi-step work may use an additional Markdown file in this directory and link it below.

## Current state

- Android selection fix: [`../completed/android-selection-paginator.md`](../completed/android-selection-paginator.md), event-level regression and fix complete; quick/full verification passed (82 passed, 1 skipped). Native device validation remains under TD-2026-001.

- Harness status: established.
- Product specification: baseline documented in `docs/product-specs/index.md`.
- Architecture: current runtime, persistence, export, safety, and release boundaries documented in `ARCHITECTURE.md`.
- Verification: `npm run verify:quick` and `npm run verify:full` are the standard gates.
- Active feature plan: [`mobile-selection-navigation-lock.md`](mobile-selection-navigation-lock.md) for GitHub Issue #3.
- Latest completed release plan: [`../completed/release-1.0.2.md`](../completed/release-1.0.2.md).
- Latest completed feature plan: [`../completed/highlight-list-readability.md`](../completed/highlight-list-readability.md) for GitHub Issue #7.

## Workflow

For each multi-step change:

1. Add a plan under `docs/exec-plans/active/<topic>.md` with scope, acceptance criteria, risks, steps, and validation.
2. Link it from this file and update the checkpoint after meaningful progress.
3. Record newly accepted compromises in `../tech-debt.md` as they are discovered.
4. Run the appropriate verification gate and record the result in the plan.
5. Move the completed plan to `../completed/` and remove its active link.

## Last harness verification

- Date: 2026-09-23
- Commands: `npm run verify:full` in the working tree; `npm ci` and `npm run release:check` in a clean worktree at commit `1356c2a`; GitHub Actions run 35875329925 at tag `1.0.2`
- Result: passed (23 test files and 82 tests passed; 1 fixture test skipped; production build, release packaging, and public asset validation passed).
