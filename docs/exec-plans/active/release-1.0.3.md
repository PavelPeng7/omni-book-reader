# Release 1.0.3

Status: In progress
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
