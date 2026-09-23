# Release 0.9.8

Status: Completed

## Scope

Publish the current stable Omni Book Reader build as version 0.9.8. This is a metadata and release-artifact update with no additional runtime behavior changes since 0.9.7.

## Release gates

- Version metadata agrees across package, manifest, lockfile, and compatibility mapping.
- `npm run verify:full` passes.
- `npm run release:check` passes and packages non-empty `main.js`, `manifest.json`, and `styles.css`.
- The 0.9.8 commit and tag are pushed so the GitHub release workflow can publish assets.

## Validation log

- 2026-09-23: `npm run verify:full` passed: lint, TypeScript, 22 test files / 71 tests passed, 1 fixture test skipped by its existing condition, production build, and release asset validation.
- 2026-09-23: `npm run release:check` passed and packaged the release assets.
- Pending: publish the version commit/tag and confirm the GitHub Actions release.
