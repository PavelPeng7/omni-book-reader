# Release 1.0.0

Status: Published, remote asset verification failed

## Scope

Publish the current reader build as 1.0.0 and verify that GitHub exposes all three release assets through the release-by-tag API used by release consumers. This release changes packaging and verification, not reader behavior.

## Steps

1. Update version metadata and add a post-publication asset check to the release workflow.
2. Run local quick and full verification, including release packaging.
3. Commit, tag, and push 1.0.0.
4. Check the workflow, release-by-tag API, and direct asset downloads before declaring the release complete.

## Risks

- GitHub may continue returning an empty asset list for a release that has uploaded files. A failed post-publication check must be reported explicitly.
- Mobile selection-handle behavior still needs Android and iOS device validation as tracked by the active feature plan.

## Validation log

- 2026-09-23: `npm run verify:quick`, `npm run verify:full`, and `npm run release:check` passed. 22 test files / 71 tests passed; 1 fixture test skipped by its existing condition. Production assets validated and packaged.
- 2026-09-23: Release workflow YAML parsed successfully; remote release-by-tag verification added with five consecutive checks.
- 2026-09-23: Commit `ac4196c` and tag `1.0.0` were pushed. GitHub started two runs for the same tag; the later duplicate was cancelled to avoid competing uploads.
- 2026-09-23: The retained [release workflow](https://github.com/PavelPeng7/omni-book-reader/actions/runs/35837582551) uploaded all three assets, but its release-by-tag check returned an empty asset list on all 12 attempts and failed.
- 2026-09-23: Release ID `394449016` lists `main.js` (372479 bytes), `manifest.json` (310 bytes), and `styles.css` (84057 bytes) as uploaded. The public release-by-tag REST endpoint still reports `assets: []`; editing asset metadata exposed them only transiently.
- Pending: resolve the inconsistent GitHub API result and obtain a stable release-by-tag check before marking 1.0.0 complete.
