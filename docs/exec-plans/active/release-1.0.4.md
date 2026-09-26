# Release 1.0.4

Status: In progress
Date: 2026-09-26

## Scope and acceptance

Publish the Android selection-handle scroll lock as 1.0.4. The tag must contain the reader source, focused regression tests, product/design records, and matching version metadata. GitHub Release must expose non-empty `main.js`, `manifest.json`, and `styles.css` assets.

## Steps

1. Bump `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` to 1.0.4.
2. Stage only the selection fix and release scope, preserving the unrelated annotation-export changes.
3. Verify the selected source in a clean worktree with `npm ci` and `npm run release:check`.
4. Commit, push, tag, monitor the release workflow, and validate published assets.
5. Record release evidence and close this plan.

## Risks

- Native Android selection-handle validation remains pending under TD-2026-001.
- The working tree contains unrelated annotation-export changes that must remain outside this tag.

## Validation log

- Pending.
