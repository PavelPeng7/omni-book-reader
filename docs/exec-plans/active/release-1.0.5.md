# Release 1.0.5

Status: In progress
Date: 2026-09-26

## Scope and acceptance

Publish the Android selection-handle visible-page boundary fix as 1.0.5. The tag must contain the reader source, focused regression tests, product/design records, and matching version metadata. GitHub Release must expose non-empty `main.js`, `manifest.json`, and `styles.css` assets.

## Steps

1. Bump `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` to 1.0.5.
2. Stage only the selection-handle fix and release scope, preserving unrelated annotation-export changes.
3. Verify the selected source in a clean worktree with `npm ci`, `npm run release:check`, and `npm run verify:full`.
4. Commit, push, tag, monitor the release workflow, and validate published assets.
5. Record release evidence and close this plan.

## Risks

- Native Android handle appearance remains unverified under TD-2026-001.
- The working tree contains unrelated annotation-export changes that must remain outside this tag.

## Validation log

- 2026-09-26: release scope committed as `667e6ab`; unrelated annotation-export working-tree changes were excluded.
- Clean detached worktree at `667e6ab` passed `npm ci`, `npm run release:check`, and `npm run verify:full` (91 tests passed, 1 existing fixture test skipped). `dist/` contains non-empty `main.js` (373774 bytes), `manifest.json` (319 bytes), and `styles.css` (86981 bytes).
- Clean-worktree SHA-256: `main.js` `6fb2788b0488ace519384dc62d0861fe3d57e576d05b0c61a6d9a3f8be8124e9`; `manifest.json` `b83f99d94979795e3f9072026335e6487698b5fac5dce9e236ccc01899e98bad`; `styles.css` `1fb87ed1f30b51d8261e1b1ed4c2254d7eaa6c2a28426386aa528c7b8d442ae0`.
