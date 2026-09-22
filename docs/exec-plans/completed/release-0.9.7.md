# Release 0.9.7

Status: Completed locally

## Scope

Publish the selection-navigation fixes as Omni Book Reader 0.9.7. This patch prevents mobile selection-handle drags from turning backward pages and restores click-outside dismissal for pending selections.

## Release gates

- Version metadata agrees across package, manifest, lockfile, and compatibility mapping.
- `npm run release:check` passes.
- `dist/` contains non-empty `main.js`, `manifest.json`, and `styles.css` for 0.9.7.
- Android and iOS manual selection-handle verification remains a post-build validation item.

## Validation log

- 2026-09-20: `npm run release:check` passed: lint, TypeScript, 22 test files / 71 tests passed, 1 fixture test skipped by its existing condition; production build, release validation, and packaging passed.
- 2026-09-20: release assets validated as `main.js` 363.7 KiB, `manifest.json` 0.3 KiB, and `styles.css` 82.1 KiB.
- Pending: publish the version commit/tag and complete Android/iOS manual selection-handle verification.
