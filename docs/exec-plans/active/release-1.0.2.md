# Release 1.0.2

Status: In progress
Date: 2026-09-23

## Scope and acceptance

Publish the Android selection navigation repair as 1.0.2. The source tag contains the reader event fix, its regression tests, product and design records, and synchronized release metadata. The GitHub release directly attaches non-empty `main.js`, `manifest.json`, and `styles.css`.

## Steps

1. Bump `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` to 1.0.2.
2. Verify the exact selected source and release packaging from a clean checkout.
3. Commit and tag 1.0.2, push, monitor the release workflow, and validate public assets and hashes.
4. Record publication evidence and close this plan.

## Risks

- Native Android selection-handle testing remains pending under TD-2026-001. Automated event-level coverage exercises the identified Foliate path, but cannot prove Android WebView behavior.
- Preserve other worktree changes. Stage only the release scope.
- GitHub release-by-tag asset visibility needs the same remote verification used for 1.0.1.

## Validation log

- 2026-09-23: selected release files and synchronized `manifest.json`, `package.json`, `package-lock.json`, and `versions.json` for 1.0.2. README describes mobile selection behavior.
- 2026-09-23: `npm run verify:full` passed in the working tree: lint, type-check, 82 tests passed and 1 existing fixture test skipped, production bundle, and release asset validation.
