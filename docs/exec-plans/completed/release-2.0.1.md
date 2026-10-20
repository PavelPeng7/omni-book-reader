# Release 2.0.1

Status: Complete
Date: 2026-10-20

## Scope and acceptance

Publish the library initialization recovery fix requested by the user. Failed loads must not save fallback defaults or repeatedly replace the original error with readiness failures. Layout-ready/manual refresh recovery restores persisted state and reader leaves. The managed-library format remains unchanged.

Publish source and exactly three nonempty assets: main.js, manifest.json, styles.css. Exclude personal reading state, installation location, backups and local diagnostic reports. Native cold-start acceptance remains under TD-2026-005; no full native acceptance is claimed.

## Steps

1. Align manifest/package/lockfile/versions at 2.0.1 and prepare upgrade notes.
2. Run quick/full verification and packaging; review the exact public source snapshot.
3. Commit and push source and version tag; monitor the release workflow.
4. Verify release-by-tag assets, public download hashes and manifest version; archive this plan.

## Progress

- Confirmed latest stable release 2.0.0 and origin/main at 08c5a5f; 2.0.1 tag is available.
- Version metadata and release notes prepared; source fix already passed full verification at 2.0.0 (133 tests) and real-library fixture checks (3 tests).
- Final `npm run verify:full` passed at 2.0.1: lint, TypeScript, 133 tests, production build and release asset validation. Three opt-in fixture checks are skipped by default and passed separately during diagnosis. Personal reports are excluded locally.
- Packaged the three assets. Release source commit `4e83c41b431ead92961bbc5bea348260bd4845b1` and annotated tag `2.0.1` pushed to origin.
- [Release workflow 39442223068](https://github.com/PavelPeng7/omni-book-reader/actions/runs/39442223068) succeeded from the tagged source, including clean dependency installation, release:check, attestations and five consecutive release-by-tag checks.
- [Release 2.0.1](https://github.com/PavelPeng7/omni-book-reader/releases/tag/2.0.1) is the latest stable release. Exactly three public downloads are nonempty; SHA-256 matches GitHub asset digests. main.js matches the locally verified bundle; manifest/styles match tagged Git blobs. Downloaded manifest reports version 2.0.1.

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| main.js | 395189 | 668e2e2e0f061f51959d391ff09bd6078671330c8aeb9fa781c2238e1930cb8e |
| manifest.json | 310 | 81fe04efcdd9d71142a3c15fed524683e66ba1116b261e9762981cd499a36a9e |
| styles.css | 85179 | 83d873b800abf462eddcce2caf06a0f6be6ff15835ba4bf5f376dbf3cd5e8c96 |

No live library data was changed by publication. Personal diagnostic reports and installation location remain local. Native cold-start/full desktop-mobile acceptance and action-runtime maintenance remain tracked in TD-2026-005/006; no tracker issues were closed.
