# Release 1.0.1

Status: Complete

## Scope and acceptance

Publish a release-only patch from committed application source. Keep the current uncommitted reader changes out of this version.

- `manifest.json`, `package.json`, `package-lock.json`, and `versions.json` agree on 1.0.1 and Obsidian 1.9.14.
- The tagged source excludes generated `main.js`; GitHub Release attaches non-empty `main.js`, `manifest.json`, and `styles.css` directly.
- Quick, full, and release packaging checks pass from a clean checkout.
- The release workflow succeeds; the public release-by-tag API repeatedly lists all three assets; downloaded SHA-256 hashes match the published assets.

## Steps

1. Make the release metadata and artifact-tracking changes; repair Windows verification wrappers.
2. Verify the selected changes, commit only release files, and test the commit in a clean worktree.
3. Push the commit and a single `1.0.1` tag, then monitor the workflow and public assets.
4. Record evidence, close the plan, and report any remaining limitations.

## Risks

- Existing uncommitted reader code must remain outside the release commit and build.
- GitHub previously exposed uploaded 1.0.0 assets inconsistently by tag; remote verification is required before completion.
- Device-level mobile selection checks remain tracked in the separate active feature plan.

## Validation log

- 2026-09-23: `npm run verify:quick` passed on Windows Node 24.14.1 after the wrapper change: 22 test files and 71 tests passed, one fixture test skipped. This working tree also contains separate uncommitted reader changes; clean-commit verification is still pending.
- 2026-09-23: Commit `eca501b` contains only release metadata, documentation, verification-script changes, and removal of tracked `main.js`. A detached clean worktree at that commit passed `npm ci`, `npm run verify:full`, and `npm run release:check` (71 tests passed, one skipped); `dist/` contained all three non-empty files.
- 2026-09-23: Tag `1.0.1` and commit `eca501b` were pushed. [GitHub Actions run 35860989057](https://github.com/PavelPeng7/omni-book-reader/actions/runs/35860989057) succeeded, including asset attestation and five consecutive release-by-tag API checks.
- 2026-09-23: The unauthenticated public release-by-tag API lists exactly `main.js`, `manifest.json`, and `styles.css`. All three downloaded assets match its sizes and SHA-256 digests; the downloaded manifest declares 1.0.1. The tag source does not track `main.js`.
