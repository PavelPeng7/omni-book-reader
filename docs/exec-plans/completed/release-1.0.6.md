# Release 1.0.6

Status: Complete
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
- Release source commit `b66bc7a` was pushed to `main` and tagged `1.0.6`.
- [Release workflow 36243915575](https://github.com/PavelPeng7/omni-book-reader/actions/runs/36243915575) passed, including the release-by-tag asset checks.
- [Public release](https://github.com/PavelPeng7/omni-book-reader/releases/tag/1.0.6) exposes exactly three uploaded assets. Downloaded files match GitHub's SHA-256 digests: `main.js` 374141 bytes, `460e1d90e89d568bd753a3b333d10d1be3292696be84f230dce3843373c9a279`; `manifest.json` 310 bytes, `c7d9860e89d17dbb8ba3b77ce4181567802400ba24b9b4833b00a9ec03840eef`; `styles.css` 84057 bytes, `46bd3a0c2637eae7541abbcdf23c431ab99751b3bfc8ba5159f28d8981020102`.
- Native Android selection validation remains under TD-2026-001.
