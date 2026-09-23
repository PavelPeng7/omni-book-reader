# Technical Debt Register

Record intentional compromises that have a concrete maintenance, reliability, security, performance, accessibility, or product cost. Do not use this file as a general idea backlog.

## Open items

### TD-2026-003: Verification wrappers fail on Windows Node 24

- Status: Resolved (2026-09-23)
- Area: local verification scripts
- Introduced: 2026-09-23, `docs/exec-plans/completed/release-1.0.0.md`
- Impact: `npm run verify:quick` and `npm run verify:full` stop before running any checks because Node 24 reports `spawn EINVAL` for `npm.cmd`; contributors must run the underlying commands directly on this setup
- Reason accepted: this does not affect the Node 20 GitHub release workflow or the published release assets; the underlying lint, type-check, test, build, and release validation commands passed locally
- Exit criteria: both wrapper commands run successfully on supported Windows Node versions
- Owner/trigger: address when maintaining the verification scripts
- Resolution: both wrappers now launch npm's CLI through `process.execPath` on Windows; `verify:quick` and `verify:full` passed on Node 24.14.1 for release 1.0.1.

### TD-2026-002: GitHub release-by-tag API omits uploaded assets

- Status: Resolved (2026-09-23)
- Area: GitHub release distribution
- Introduced: 2026-09-23, `docs/exec-plans/completed/release-1.0.0.md`
- Impact: version-based release validators report missing `main.js` and `manifest.json` even though the Release ID and asset-list endpoints show all three files as uploaded
- Reason accepted: rebuilding the release, reuploading an asset, republishing, and editing asset metadata did not make the release-by-tag response consistently list assets; this appears to require GitHub-side correction
- Exit criteria: `GET /repos/PavelPeng7/omni-book-reader/releases/tags/1.0.0` consistently lists `main.js`, `manifest.json`, and `styles.css`, and all three assets can be downloaded with matching SHA-256 hashes
- Resolution: five unauthenticated release-by-tag checks spaced 10 seconds apart listed all three files, and downloaded assets matched GitHub's recorded SHA-256 digests. The earlier workflow run remains failed in its historical log.

### TD-2026-001: Native selection handles lack integration coverage

- Status: Open
- Area: reader selection, touch input, Foliate pagination
- Introduced: 2026-08-28, `docs/exec-plans/completed/chapter-boundary-selection.md`
- Impact: unit tests cover gesture and boundary decisions, but cannot reproduce browser-native selection-handle timing, iframe event ordering, or document replacement at a spine boundary; regressions can remain device-specific until manual testing
- Reason accepted: the current Vitest/jsdom environment does not provide native selection handles or an Obsidian mobile runtime
- Exit criteria: an integration or device test asserts that mobile selection-handle drags never navigate, while desktop mouse edge-assisted selection still navigates only within valid LTR/RTL section boundaries
- Owner/trigger: revisit when adding browser-driven Obsidian tests, upgrading Foliate, or changing selection/touch event handling
- 2026-09-23 coverage improvement: event-level tests now reproduce Foliate's touch-pointer selectionchange auto-navigation using the installed dependency handlers and the reader's document wiring. Native Android handle timing and rendering still require device verification; this item remains open.

## Entry template

```markdown
### TD-YYYY-NNN: Short title

- Status: Open | In progress | Resolved | Accepted
- Area: module or workflow
- Introduced: YYYY-MM-DD, plan/commit link
- Impact: concrete user or engineering cost
- Reason accepted: why the compromise is reasonable now
- Exit criteria: observable conditions for resolving it
- Owner/trigger: person, milestone, or event that should revisit it
```

When an item is resolved, keep the entry and add the resolution date and relevant design or execution-plan link.
