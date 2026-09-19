# Release 0.9.5

Status: Completed

## Scope

Publish the current `main` branch as Omni Book Reader 0.9.5 using the tag-triggered GitHub Actions release workflow.

## Release gates

- Version metadata agrees across package, manifest, lockfile, and compatibility mapping.
- `npm run release:check` passes.
- The version commit is pushed before the `0.9.5` tag.
- The tag workflow succeeds and publishes non-empty `main.js`, `manifest.json`, and `styles.css` assets.

## Validation log

- 2026-09-19: `npm run release:check` passed: lint, TypeScript, 21 test files / 67 tests passed, 1 fixture test skipped by its existing condition; production build, asset validation, and packaging passed.
- 2026-09-19: pushed release commit `63ecc9a79ea29299a525f9850361b19abe045012` and tag `0.9.5`.
- 2026-09-19: GitHub Actions run `35425633008` succeeded and published a non-draft, non-prerelease `0.9.5` release.
- 2026-09-19: verified the published `manifest.json` reports version `0.9.5`; `main.js` (372080 bytes), `manifest.json` (310 bytes), and `styles.css` (80606 bytes) are present and non-empty.
