# Release 1.0.4

Status: Complete
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

- 2026-09-26: release scope committed as `1acce9a`; unrelated annotation-export working-tree changes were excluded.
- Clean detached worktree at `1acce9a` passed `npm ci`, `npm run release:check`, and `npm run verify:full` (84 tests passed, 1 existing fixture test skipped). `dist/` contains non-empty `main.js` (372968 bytes), `manifest.json` (319 bytes), and `styles.css` (86981 bytes).
- Clean-worktree SHA-256: `main.js` `192d44c19eeda36b9a4240e1e03708bf140b94ea5ebc1f60c7f08282cb95f6f3`; `manifest.json` `f115f8a7b4555a81fd12f1c3d2babfb8508ac52e056b959b6b6093152ca0aec6`; `styles.css` `1fb87ed1f30b51d8261e1b1ed4c2254d7eaa6c2a28426386aa528c7b8d442ae0`.
- 2026-09-26: tag `1.0.4` points to `24d2b8a`; `main` and tag were pushed to origin. [Release workflow 36227706919](https://github.com/PavelPeng7/omni-book-reader/actions/runs/36227706919) succeeded, including five consecutive release-by-tag asset checks.
- [Public release](https://github.com/PavelPeng7/omni-book-reader/releases/tag/1.0.4) is published with exactly `main.js`, `manifest.json`, and `styles.css`. Downloaded sizes and SHA-256 hashes match GitHub's published digests: `main.js` 372968 bytes, `192d44c19eeda36b9a4240e1e03708bf140b94ea5ebc1f60c7f08282cb95f6f3`; `manifest.json` 310 bytes, `300128e0a3b0865840c92c3e746d258d7355d1059ff913721d067f81a3848f99`; `styles.css` 84057 bytes, `46bd3a0c2637eae7541abbcdf23c431ab99751b3bfc8ba5159f28d8981020102`. The Windows checkout used CRLF for manifest and stylesheet, so its local hashes for those files differ from the tagged blobs.
- Native Android selection-handle validation remains under TD-2026-001.
