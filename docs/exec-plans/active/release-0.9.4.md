# Release 0.9.4

Status: Awaiting mobile device validation or explicit risk acceptance

## Scope

Publish the mobile selection navigation fix as Omni Book Reader 0.9.4 through the repository's tag-triggered GitHub Actions release workflow.

## Release gates

- Version metadata agrees across package, manifest, lockfile, and compatibility mapping.
- Lint, type-check, full tests, production build, release validation, and packaging pass.
- Android and iOS selection-handle behavior is manually verified or the release risk is explicitly accepted by the maintainer.
- The release commit is pushed before the `0.9.4` tag.
- The tag workflow succeeds and publishes non-empty `main.js`, `manifest.json`, and `styles.css` assets.

## Validation log

- 2026-09-17: `npm run release:check` passed.
- 2026-09-17: lint and TypeScript checks passed.
- 2026-09-17: 21 test files and 67 tests passed; 1 fixture test skipped by its existing condition.
- 2026-09-17: production build, 0.9.4 release validation, and packaging passed.
- Pending: Android and iOS native selection-handle verification, or explicit maintainer acceptance of releasing without it.
