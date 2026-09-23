# Release 1.0.0

Status: In progress

## Scope

Publish the current reader build as 1.0.0 and verify that GitHub exposes all three release assets through the release-by-tag API used by release consumers. This release changes packaging and verification, not reader behavior.

## Steps

1. Update version metadata and add a post-publication asset check to the release workflow.
2. Run local quick and full verification, including release packaging.
3. Commit, tag, and push 1.0.0.
4. Check the workflow, release-by-tag API, and direct asset downloads before declaring the release complete.

## Risks

- GitHub may continue returning an empty asset list for a release that has uploaded files. A failed post-publication check must be reported explicitly.
- Mobile selection-handle behavior still needs Android and iOS device validation as tracked by the active feature plan.

## Validation log

- 2026-09-23: `npm run verify:quick`, `npm run verify:full`, and `npm run release:check` passed. 22 test files / 71 tests passed; 1 fixture test skipped by its existing condition. Production assets validated and packaged.
- 2026-09-23: Release workflow YAML parsed successfully; remote release-by-tag verification added with five consecutive checks.
- Pending: push the release commit and tag, then confirm GitHub Actions and public asset visibility.
