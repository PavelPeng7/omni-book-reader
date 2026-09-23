# Release 0.9.9

Status: Completed

## Scope

Publish the selection-navigation fix that prevents a touch selection gesture from becoming a page turn when the native range briefly collapses at `touchend`.

## Release gates

- Version metadata agrees across package, manifest, lockfile, and compatibility mapping.
- `npm run verify:full` passes.
- `npm run release:check` passes and packages non-empty release assets.
- The 0.9.9 commit and tag are pushed so GitHub Actions can publish the release.

## Validation log

- 2026-09-23: `npm run verify:full` passed: lint, TypeScript, 22 test files / 71 tests passed, 1 fixture test skipped by its existing condition, production build, and release asset validation.
- 2026-09-23: `npm run release:check` passed and packaged the release assets.
- Pending: publish the version commit/tag and confirm the GitHub Actions release.
