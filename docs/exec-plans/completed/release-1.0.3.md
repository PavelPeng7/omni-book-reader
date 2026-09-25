# Release 1.0.3

Status: Complete
Date: 2026-09-25

## Scope and acceptance

Publish the selection navigation behavior and its configurable setting as 1.0.3. The tag must contain the source, tests, product/design records, and matching version metadata. GitHub Release must expose non-empty `main.js`, `manifest.json`, and `styles.css` assets.

## Steps

1. Bump `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` to 1.0.3.
2. Stage only the release scope and verify the selected source in a clean worktree with `npm ci` and `npm run release:check`.
3. Commit, push, tag, monitor the release workflow, and validate published assets.
4. Record release evidence and close this plan.

## Risks

- Native selection-handle verification remains pending under TD-2026-001.
- Preserve unrelated working-tree changes and stage only release files.

## Validation log

- 2026-09-25: release scope committed as `a7bd295`; unrelated working-tree changes were excluded.
- 2026-09-25: clean detached worktree at `a7bd295` passed `npm ci` and `npm run release:check` (79 tests passed, 1 existing fixture test skipped). `dist/` contains non-empty `main.js` (371804 bytes), `manifest.json` (319 bytes), and `styles.css` (86981 bytes).
- Clean-worktree SHA-256: `main.js` `aa52f53a6bbf34b78fba26630ee076dac7bc8b43ebadfee027ba027332f184cc`; `manifest.json` `b5b147a0ea82f6e219294c23627b0c2dbfb55bd12bd13b5d8c5760f409bb3c94`; `styles.css` `1fb87ed1f30b51d8261e1b1ed4c2254d7eaa6c2a28426386aa528c7b8d442ae0`.
- 2026-09-25: tag `1.0.3` points to `a31150c`; `main` and tag were pushed to origin. Two identical release runs started; the duplicate was cancelled. The first run completed build, attestation, and release creation but failed its asset-visibility threshold before the final two assets appeared. The [rerun of workflow 36112466590](https://github.com/PavelPeng7/omni-book-reader/actions/runs/36112466590) succeeded, including five consecutive release-by-tag asset checks.
- 2026-09-25: [public release](https://github.com/PavelPeng7/omni-book-reader/releases/tag/1.0.3) is published with exactly `main.js`, `manifest.json`, and `styles.css`. Downloaded SHA-256 hashes match GitHub's published digests and the tag source/build: `aa52f53a6bbf34b78fba26630ee076dac7bc8b43ebadfee027ba027332f184cc`, `685969930c9884e015c6d3872c232dc795c4bdc7c37188e1043aca6e5ef97bdb`, and `46bd3a0c2637eae7541abbcdf23c431ab99751b3bfc8ba5159f28d8981020102`, respectively. The Windows checkout used CRLF for manifest and stylesheet, so its local hashes for those files differ from the tagged blobs.
- Native desktop/mobile selection-handle validation remains under TD-2026-001.
