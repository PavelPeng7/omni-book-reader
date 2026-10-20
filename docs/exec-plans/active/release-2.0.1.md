# Release 2.0.1

Status: In progress
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
