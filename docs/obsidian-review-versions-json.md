# Obsidian Automated Review Failure: Missing versions.json

Incident record and prevention guide for the Obsidian developer portal's
automated release review.

## Symptom

In the Obsidian developer dashboard (obsidian.md -> Plugins -> Omni Reader),
the release review list showed:

| Date       | Version | Status    |
| ---------- | ------- | --------- |
| 2026-08-18 | 0.7.4   | Failed    |
| 2026-08-17 | 0.7.3   | Failed    |
| 2026-08-17 | 0.7.2   | Failed    |
| 2026-08-17 | 0.7.1   | Failed    |
| 2026-08-07 | 0.7.0   | Completed |

Each failed release carried the banner:

> The automated review for this release could not be completed. An
> administrator will investigate.

The wording "could not be completed" (rather than a rule violation) points at
the review pipeline failing to resolve something, not at rejected code.

## Root cause

The repository did not ship a `versions.json` at its root.

Obsidian resolves which plugin release an app version may install by reading
`versions.json` from the repository at the release tag. The file maps each
plugin version to its `minAppVersion`:

```json
{
  "0.7.0": "1.9.14",
  "0.7.4": "1.9.14"
}
```

Without it, the automated review cannot resolve app compatibility and aborts
with the generic "could not be completed" message. The error names no rule,
which makes the failure look transient; it is reproducible until the file
exists. Release 0.7.0 passed because it predates the requirement being
enforced on this listing.

## What was ruled out first

- GitHub Actions release workflow: green for every affected tag.
- Release assets: `main.js`, `manifest.json`, `styles.css` all present and
  non-empty on every release.
- `manifest.json`: identical between 0.7.0 (passed) and 0.7.4 (failed) except
  the version field.
- Code patterns an automated scanner might flag (`XMLHttpRequest`,
  `eval`-style constructs): unchanged between the passing and failing builds.

## Fix (released in 0.7.5)

1. Added `versions.json` at the repository root covering every listed release
   (0.7.0 onward), all mapped to `minAppVersion` 1.9.14.
2. `esbuild.config.mjs` production build now appends the current
   `manifest.json` version to `versions.json` automatically, so the file
   cannot drift from the manifest.
3. `scripts/validate-release.mjs` (run by `npm run release:check` in CI)
   fails the release if `versions.json` does not map the manifest version to
   the manifest's `minAppVersion`.

## Release checklist addition

Before tagging a release, `npm run release:check` must pass; it now includes
the `versions.json` consistency gate. If the portal review still reports
"could not be completed" while this gate is green, expand the failed review
row in the dashboard for details, or use the "Review branch" button to
re-trigger; at that point the cause is on Obsidian's side.

## References

- Same error, same fix, in another plugin:
  https://github.com/ikeniborn/obsidian-ai-wiki/pull/74
- Obsidian plugin guidelines:
  https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
