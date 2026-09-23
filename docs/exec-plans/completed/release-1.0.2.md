# Release 1.0.2

Status: Complete
Date: 2026-09-23

## Scope and acceptance

Publish the Android selection navigation repair as 1.0.2. The source tag contains the reader event fix, its regression tests, product and design records, and synchronized release metadata. The GitHub release directly attaches non-empty `main.js`, `manifest.json`, and `styles.css`.

## Steps

1. Bump `package.json`, `package-lock.json`, `manifest.json`, and `versions.json` to 1.0.2.
2. Verify the exact selected source and release packaging from a clean checkout.
3. Commit and tag 1.0.2, push, monitor the release workflow, and validate public assets and hashes.
4. Record publication evidence and close this plan.

## Risks

- Native Android selection-handle testing remains pending under TD-2026-001. Automated event-level coverage exercises the identified Foliate path, but cannot prove Android WebView behavior.
- Preserve other worktree changes. Stage only the release scope.
- GitHub release-by-tag asset visibility needs the same remote verification used for 1.0.1.

## Validation log

- 2026-09-23: selected release files and synchronized `manifest.json`, `package.json`, `package-lock.json`, and `versions.json` for 1.0.2. README describes mobile selection behavior.
- 2026-09-23: `npm run verify:full` passed in the working tree: lint, type-check, 82 tests passed and 1 existing fixture test skipped, production bundle, and release asset validation.
- 2026-09-23: clean detached worktree at commit `1356c2a` passed `npm ci` and `npm run release:check`; 82 tests passed, 1 existing fixture test skipped. `dist/` contained non-empty `main.js` (372637 bytes), `manifest.json` (319 bytes), and `styles.css` (86981 bytes). SHA-256: `1f32b6ccab4f5e6ee6fb16bf1ef9f82cdc011096d475b97e882e21c8f47f7764`, `2052f2a60b038ace7d51ffce2bfba9ed062fa1bcdaa361a6e90187e33c035d9a`, `1fb87ed1f30b51d8261e1b1ed4c2254d7eaa6c2a28426386aa528c7b8d442ae0`, respectively.
- 2026-09-23: tag `1.0.2` points to `b71c372`; `main` and tag pushed to origin. [GitHub Actions run 35875329925](https://github.com/PavelPeng7/omni-book-reader/actions/runs/35875329925) succeeded, including attestation and five consecutive release-by-tag API checks.
- 2026-09-23: [public release](https://github.com/PavelPeng7/omni-book-reader/releases/tag/1.0.2) is published with exactly `main.js`, `manifest.json`, and `styles.css`. Downloaded assets match their published SHA-256 digests and the tagged source/build: `1f32b6ccab4f5e6ee6fb16bf1ef9f82cdc011096d475b97e882e21c8f47f7764`, `62acb493d4f619fcc64f55f04cbfbb40457604212fc2d8d600d6d156bc27080d`, and `46bd3a0c2637eae7541abbcdf23c431ab99751b3bfc8ba5159f28d8981020102`. The Windows clean-worktree checkout used CRLF for manifest and stylesheet, so its local hashes for those two files differ while the tag blobs match the published downloads exactly.
- Native Android selection-handle validation remains tracked under TD-2026-001; the release includes the event-level regression and the identified Foliate bypass fix.
