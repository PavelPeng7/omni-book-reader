# Release artifacts

Status: Accepted
Date: 2026-09-23

## Decision

Version tags contain source and release metadata, but not the generated `main.js` bundle. The tag-triggered workflow installs locked dependencies, runs release checks, and attaches `main.js`, `manifest.json`, and `styles.css` as three direct GitHub Release assets. The workflow then checks the release-by-tag API repeatedly because version-based consumers use that endpoint.

Local plugin development still creates `main.js` at the repository root for Obsidian, but Git ignores it. Package and manifest versions must match the tag, and `versions.json` must map that version to `minAppVersion`.

Starting with 2.0.0, each new tag must include `docs/release-notes/<version>.md`. The workflow supplies that file as the release body alongside generated change notes, so storage compatibility and upgrade instructions are visible when the release is created.

## Consequences and validation

The bundle can be reproduced from tagged source with `npm ci` and `npm run release:check`. A complete release requires a successful workflow, exact asset names, non-empty downloads, and matching SHA-256 hashes. A source-tree `main.js` or an asset visible only through the release ID does not meet this check.
