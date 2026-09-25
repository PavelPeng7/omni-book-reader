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

Pending.
