# Release 2.0.0

Status: Complete
Date: 2026-10-19

## Scope and acceptance

Publish the managed library, portable per-book state and exports, readable generated names, and bookshelf refresh stability. This deliberately incompatible storage change uses a major version. Publish source and exactly three nonempty assets: main.js, manifest.json, styles.css. The user explicitly requested the release.

Personal library-location.json, live reading data, migration backups and the private one-off migration record are excluded. Runtime data migration remains unsupported; release notes must explain move-import, fresh settings/state, and whole-folder deletion.

## Steps

1. Align manifest, package, lockfile and versions map at 2.0.0; prepare release notes.
2. Run quick/full verification and packaging; inspect the source snapshot and commit only release inputs and public documentation.
3. Push the source and version tag; monitor the existing release workflow.
4. Verify release-by-tag asset visibility and download hashes; record evidence and archive this plan.

## Risks and verification boundary

- Native desktop/mobile acceptance remains open under TD-2026-005; no native verification is claimed.
- One existing EPUB fixture test is skipped; automated coverage includes managed-library integration and real bookshelf-view DOM regression tests.
- GitHub Issue acceptance/closure is separate from publication and will remain unchanged.

## Progress

- Confirmed origin/main at 46e994b and latest public release 1.0.6; tag 2.0.0 does not exist.
- Reviewed publication workflow and its release-by-tag checks; authenticated GitHub CLI is available.
- Version metadata aligned at 2.0.0; the workflow now includes versioned release notes at creation so upgrade instructions are immediately visible.
- `npm run verify:quick` and `npm run verify:full` passed: 128 tests passed, 1 existing fixture skipped; lint, TypeScript, production build and version/asset validation passed. Packaged the three verified assets in dist/.
- Source review excludes personal migration records and the ignored library-location.json. Removed extra EOF blank lines in historical ticket documents before committing.
- Release source commit `90d6b1f` pushed to main and annotated tag `2.0.0` pushed. [Release workflow 39143458915](https://github.com/PavelPeng7/omni-book-reader/actions/runs/39143458915) succeeded from that exact source, including clean npm ci, release:check, asset attestations and five consecutive release-by-tag asset checks.
- [Public release 2.0.0](https://github.com/PavelPeng7/omni-book-reader/releases/tag/2.0.0) is the latest stable release. Its initial body includes the versioned compatibility/upgrade instructions and the generated comparison link.
- Public unauthenticated downloads verified: exact asset names, nonempty size, manifest version 2.0.0, SHA-256 matching GitHub asset digests. main.js also matches the local verified production build; manifest/styles match the tagged Git blobs (avoiding Windows checkout newline differences).

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| main.js | 394026 | 45b7e678174decf092c9bb079145483d92480a4e95acc4d572505f0471002559 |
| manifest.json | 310 | 93c8853d2d2432a32c58621a35ba5ef12481a655f7a6abe951e56c0295b2808b |
| styles.css | 85179 | 83d873b800abf462eddcce2caf06a0f6be6ff15835ba4bf5f376dbf3cd5e8c96 |

Native acceptance remains open under TD-2026-005; tracker issues were not closed. Personal migration records remain local and ignored through the repository-local exclude file. No runtime library data changed during publication. Existing action-runtime deprecation annotations did not fail this release and remain tracked as TD-2026-006.
