# Release 1.0.6

Status: In progress
Date: 2026-09-26

## Scope and acceptance

Publish fixed selection navigation, outside-click/tap cancellation, and optional inverse selection colors. The tag must contain only this feature, its tests and design records, and matching 1.0.6 metadata. The GitHub Release must expose non-empty `main.js`, `manifest.json`, and `styles.css` assets.

## Steps

1. Isolate the feature from unrelated annotation export working-tree changes.
2. Verify in a clean worktree with `npm ci`, `npm run release:check`, and `npm run verify:full`.
3. Commit and push the release source, tag 1.0.6, monitor the workflow, and validate public assets.
4. Record release evidence and close the plan.

## Risks

- Native Android selection behavior remains under TD-2026-001.
- Unrelated annotation export changes remain uncommitted in the original worktree.

## Progress

- Created a detached clean worktree at `b1d0867` and copied only the selection feature; restored the unrelated documentation paragraphs.
- Bumped package, lockfile, manifest, and versions mapping to 1.0.6.
- `npm ci` and `npm run release:check` passed in the isolated worktree: 92 tests passed, 1 existing fixture test skipped; build, release metadata validation, and asset packaging passed.
