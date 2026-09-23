# Release 1.0.1

Status: In progress

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
