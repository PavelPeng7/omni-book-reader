# Release 0.9.5

Status: In progress

## Scope

Publish the current `main` branch as Omni Book Reader 0.9.5 using the tag-triggered GitHub Actions release workflow.

## Release gates

- Version metadata agrees across package, manifest, lockfile, and compatibility mapping.
- `npm run release:check` passes.
- The version commit is pushed before the `0.9.5` tag.
- The tag workflow succeeds and publishes non-empty `main.js`, `manifest.json`, and `styles.css` assets.

## Validation log

- 2026-09-19: `npm run release:check` passed: lint, TypeScript, 21 test files / 67 tests passed, 1 fixture test skipped by its existing condition; production build, asset validation, and packaging passed.
- Pending: push the version commit and `0.9.5` tag; verify GitHub Actions publication.
