# Active Work Progress

This file is the compact project-level checkpoint. Detailed multi-step work may use an additional Markdown file in this directory and link it below.

## Current state

- Release 2.0.1: [`release-2.0.1.md`](release-2.0.1.md); publishing initialization failure write protection and layout-ready/manual-refresh recovery. Full verification passed before version bump (133 regular tests; 3 fixture checks separately passed). Patched native cold start remains under TD-2026-005. Personal diagnostic reports remain local.

- Latest completed release: [`../completed/release-2.0.0.md`](../completed/release-2.0.0.md), source 90d6b1f tagged 2.0.0; local quick/full, clean CI release pipeline, release-by-tag checks and public download hashes passed. Personal runtime state and migration records excluded.

- Bookshelf flicker: [`../completed/bookshelf-refresh-stability.md`](../completed/bookshelf-refresh-stability.md), unchanged refresh now preserves DOM, loaded covers and search focus; 7 regression tests added, quick/full passed (128 passed, 1 existing fixture skipped), production bundle rebuilt. Native visual acceptance remains under TD-2026-005.

- Managed library: [`../completed/file-organization.md`](../completed/file-organization.md), implementation of #10–#15 published in 2.0.0 with the bookshelf fix; final quick/full passed (128 passed, 1 existing fixture skipped). Native desktop/mobile acceptance remains under TD-2026-005; tracker issues remain open.

- Fixed selection behavior and inverse colors: [`../completed/selection-default-and-inverse.md`](../completed/selection-default-and-inverse.md), implementation and full verification complete (92 tests passed in the isolated release source, 1 existing fixture test skipped); native Android validation remains under TD-2026-001.

- Readable annotation export names: [`../completed/readable-annotation-export-names.md`](../completed/readable-annotation-export-names.md), implementation and full verification complete (85 tests passed, 1 skipped).
- Short annotation exports: [`../completed/short-annotation-export-names.md`](../completed/short-annotation-export-names.md), implementation and full verification complete (83 tests passed, 1 skipped).
- Configurable selection navigation: [`../completed/configurable-selection-page-turns.md`](../completed/configurable-selection-page-turns.md), implementation and full verification complete.
- Selection navigation change: [`../completed/selection-never-turns-pages.md`](../completed/selection-never-turns-pages.md), implementation and full verification complete.
- Android selection fix: [`../completed/android-selection-paginator.md`](../completed/android-selection-paginator.md), event-level regression and fix complete; quick/full verification passed (82 passed, 1 skipped). Native device validation remains under TD-2026-001.

- Harness status: established.
- Product specification: baseline documented in `docs/product-specs/index.md`.
- Architecture: current runtime, persistence, export, safety, and release boundaries documented in `ARCHITECTURE.md`.
- Verification: `npm run verify:quick` and `npm run verify:full` are the standard gates.
- Active feature plan: [`mobile-selection-navigation-lock.md`](mobile-selection-navigation-lock.md) for GitHub Issue #3.
- Android selection-handle boundary follow-up: [`../completed/android-selection-handle-boundary.md`](../completed/android-selection-handle-boundary.md), automated verification complete; native Android validation remains under TD-2026-001.
- Android selection scroll follow-up: [`../completed/android-selection-scroll-lock.md`](../completed/android-selection-scroll-lock.md), implementation and automated verification complete; native Android validation remains under TD-2026-001.
- Latest completed feature plan: [`../completed/highlight-list-readability.md`](../completed/highlight-list-readability.md) for GitHub Issue #7.

## Workflow

For each multi-step change:

1. Add a plan under `docs/exec-plans/active/<topic>.md` with scope, acceptance criteria, risks, steps, and validation.
2. Link it from this file and update the checkpoint after meaningful progress.
3. Record newly accepted compromises in `../tech-debt.md` as they are discovered.
4. Run the appropriate verification gate and record the result in the plan.
5. Move the completed plan to `../completed/` and remove its active link.

## Last harness verification

- Date: 2026-09-25
- Commands: `npm ci` and `npm run release:check` in a clean worktree at commit `a7bd295`; GitHub Actions rerun 36112466590 at tag `1.0.3`; public release download and SHA-256 checks
- Result: passed (23 test files and 79 tests passed; 1 fixture test skipped; production build, release packaging, and public asset validation passed).
