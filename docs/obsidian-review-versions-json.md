# Obsidian Automated Review Failure: Scanner-side Type Resolution

Incident record and prevention guide for the Obsidian developer portal's
automated release review.

> Revision note: an earlier revision of this document blamed a missing
> `versions.json`. That diagnosis was **disproven** — release 0.7.5 shipped
> `versions.json` at the tag and its review still failed. The actual evidence
> points at an Obsidian-side bug in the review scanner's type-check stage.
> See [Root cause](#root-cause) below.

## Symptom

In the Obsidian developer dashboard (obsidian.md -> Plugins -> Omni Book Reader),
the release review list showed:

| Date       | Version | Status    |
| ---------- | ------- | --------- |
| 2026-08-19 | 0.7.6   | Failed    |
| 2026-08-18 | 0.7.5   | Failed    |
| 2026-08-18 | 0.7.4   | Failed    |
| 2026-08-17 | 0.7.3   | Failed    |
| 2026-08-17 | 0.7.2   | Failed    |
| 2026-08-17 | 0.7.1   | Failed    |
| 2026-08-07 | 0.7.0   | Completed |

Each failed release carried the banner:

> The automated review for this release could not be completed. An
> administrator will investigate.

The wording "could not be completed" (rather than a named rule violation)
means the review pipeline itself crashed while scanning, not that the code was
rejected.

## How the review pipeline works (official docs)

Per the Obsidian developer documentation, after each release the directory
service scans the entry in four sections — **Manifest**, **Releases**,
**Source code**, and **Build verification** — and rates every result as an
Error, Warning, Recommendation, or Pass:

- The scanner resolves the build script by the first of `build`,
  `build:plugin`, `compile` in `package.json`, runs it, and verifies the
  output matches the release assets.
- The scanner ignores a fixed list of files/directories: `node_modules`,
  `dist`, `build`, `*.test.*`, `tests`, `vite`, `scripts`, `docs`, `*.mjs`,
  `*.cjs`, `esbuild.config.mjs`, `version-bump.mjs`, and others.
- Reviews run **periodically**; the dashboard `...` menu offers **Check for
  new releases**, **Request review** (immediate recheck), and **Review
  branch** (preview scan of any branch/tag/commit without a release).

References: [Manage your plugin or theme](https://docs.obsidian.md/community-directory/manage-entry),
[Community directory FAQ](https://docs.obsidian.md/community-directory/faq).

## Root cause

The review scanner's **type-check stage fails to resolve dependencies inside
its sandbox**. When type resolution fails, the scanner's type-aware lint rules
cannot run and the review aborts with the generic "could not be completed"
message instead of producing a verdict. This is a known Obsidian-side bug
class, reported by other plugin authors around the same window:

- [Bug: Community Plugin Review cannot resolve obsidian package types](https://forum.obsidian.md/t/bug-community-plugin-review-cannot-resolve-obsidian-package-types/117473)
- [Bug: Community directory type check cannot resolve internal deps in monorepos](https://forum.obsidian.md/t/bug-community-directory-type-check-cannot-resolve-internal-deps-in-monorepos/116176)
  — the author observed that when the scanner's type checker cannot link a
  dependency, every export from it becomes `/* unresolved */ any` and the
  type-aware rules degenerate/crash.
- [Automated review "could not be completed" for three consecutive releases (ai-wiki)](https://forum.obsidian.md/t/automated-review-could-not-be-completed-for-three-consecutive-releases-ai-wiki/117293)
  — three releases failed identically despite a byte-identical rebuild and a
  `versions.json`; similar threads (114686, 114722, 115948, 116487) were all
  resolved server-side with the author changing nothing.

Our repository sits on the trigger surface: `obsidian@1.13.1` publishes
`"main": ""` with no `exports` field (plus peer dependencies), and the plugin
imports `obsidian` from many files under `moduleResolution: "Bundler"`.
Locally everything resolves because `npm ci` wires the dependencies correctly;
inside the scanner's sandbox the resolution path differs and hits the bug.
Release 0.7.0 passed because it predates the scanner regression that began
failing releases from 2026-08-17 onward.

### Why the `versions.json` theory was wrong

`versions.json` maps plugin versions to `minAppVersion` and is a standard
release artifact, but it is **not** what the four-section scanner reads to
resolve app compatibility, and its absence cannot crash the scan:

- Tag `0.7.5` contained a complete `versions.json` covering every release,
  and its review still failed.
- The ai-wiki author added `versions.json` in 0.3.2 and the review still
  failed identically.

The file remains a good practice (kept below), but it was a red herring for
this incident.

## Local verification: all four sections pass on our side

Checked against the official docs and the official `eslint-plugin-obsidianmd`
`recommended` config (which mirrors the scanner's rule set):

1. **Manifest** — `id`/`name`/`description`/`author` meet every naming rule;
   description ends with `.` and stays under 250 characters; no `fundingUrl`;
   `minAppVersion` set.
2. **Releases** — tags match `manifest.json` versions, no `v` prefix, not a
   draft or prerelease; `main.js`, `manifest.json`, `styles.css` attached and
   non-empty on every release.
3. **Source code** — `eslint src package.json --max-warnings 0` is green with
   the official plugin's `recommended` config (type-aware). The only local
   lint findings live in `tests/*.test.ts` and `vitest.config.ts`, which the
   scanner's ignore list excludes. No Node/Electron API usage in `src`
   (the lone `ArrayBuffer.isView` match is a false positive), so
   `isDesktopOnly: false` is valid.
4. **Build verification** — release `main.js` is byte-identical (SHA-256) to a
   fresh local production build; the build script is the first candidate
   (`build`) the scanner looks for.

If the review still reports "could not be completed" while all of the above
holds, the failure is in the scanner's environment, not in this repository.

## Mitigation shipped in 0.7.7

Best-effort attempt to dodge the scanner's resolution bug by making the
TypeScript setup as conservative as the official sample plugin:

1. `tsconfig.json` — `moduleResolution` changed from `"Bundler"` to `"node"`;
   `types` narrowed to `[]` (no `@types/node` / `vitest/globals` auto-load);
   `include` narrowed to `src/**` only, dropping `tests/**` and
   `vitest.config.ts` from the type-check program (the scanner ignores those
   files anyway; `npm test` is unaffected — Vitest does not rely on the
   tsconfig `include`).
2. Kept `versions.json` at the repository root: `esbuild.config.mjs` syncs it
   from `manifest.json` on every production build and
   `scripts/validate-release.mjs` fails the release if it drifts — harmless,
   standard, and still enforced.

This mitigation is not guaranteed to work: if the scanner's type-check bug is
independent of the repository's tsconfig, only an Obsidian-side fix will
resolve it.

## If it still fails

1. Dashboard -> entry `...` menu -> **Check for new releases** (reviews run
   periodically; a fresh release may not be picked up yet), then **Request
   review** to force an immediate recheck.
2. Run **Review branch** against the failing tag to see the per-section
   results (Manifest / Releases / Source code / Build verification) and the
   exact error.
3. Report the case in the forum threads above (117473, 117293) with this
   repository and the local verification evidence — the banner says "An
   administrator will investigate", and the other threads were resolved
   server-side.

## References

- Official docs:
  - https://docs.obsidian.md/community-directory/manage-entry
  - https://docs.obsidian.md/community-directory/faq
  - https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin
- Forum bugs (same failure class):
  - https://forum.obsidian.md/t/bug-community-plugin-review-cannot-resolve-obsidian-package-types/117473
  - https://forum.obsidian.md/t/bug-community-directory-type-check-cannot-resolve-internal-deps-in-monorepos/116176
  - https://forum.obsidian.md/t/automated-review-could-not-be-completed-for-three-consecutive-releases-ai-wiki/117293
- Prior (superseded) theory: https://github.com/ikeniborn/obsidian-ai-wiki/pull/74
