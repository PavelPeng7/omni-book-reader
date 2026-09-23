# Active Work Progress

This file is the compact project-level checkpoint. Detailed multi-step work may use an additional Markdown file in this directory and link it below.

## Current state

- Harness status: established.
- Product specification: baseline documented in `docs/product-specs/index.md`.
- Architecture: current runtime, persistence, export, safety, and release boundaries documented in `ARCHITECTURE.md`.
- Verification: `npm run verify:quick` and `npm run verify:full` are the standard gates.
- Active feature plan: [`mobile-selection-navigation-lock.md`](mobile-selection-navigation-lock.md) for GitHub Issue #3.
- Active release plan: [`release-1.0.1.md`](release-1.0.1.md).
- Latest completed release plan: [`../completed/release-1.0.0.md`](../completed/release-1.0.0.md).
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
- Commands: `npm run lint`, `npm run check`, `npm test`, `npm run build`, and `npm run validate:release`
- Result: passed (22 test files and 71 tests passed; 1 fixture test skipped; production build and release asset validation passed). The `verify:quick` and `verify:full` wrappers stopped before their first step with `spawn EINVAL` on Windows Node 24.14.1.
