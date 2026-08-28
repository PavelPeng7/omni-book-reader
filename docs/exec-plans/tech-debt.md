# Technical Debt Register

Record intentional compromises that have a concrete maintenance, reliability, security, performance, accessibility, or product cost. Do not use this file as a general idea backlog.

## Open items

### TD-2026-001: Native selection handles lack integration coverage

- Status: Open
- Area: reader selection, touch input, Foliate pagination
- Introduced: 2026-08-28, `docs/exec-plans/completed/chapter-boundary-selection.md`
- Impact: unit tests cover gesture and boundary decisions, but cannot reproduce browser-native selection-handle timing, iframe event ordering, or document replacement at a spine boundary; regressions can remain device-specific until manual testing
- Reason accepted: the current Vitest/jsdom environment does not provide native selection handles or an Obsidian mobile runtime
- Exit criteria: an integration or device test exercises a selection-handle drag across interior pages and against LTR/RTL chapter boundaries, and asserts that only valid same-section navigation occurs
- Owner/trigger: revisit when adding browser-driven Obsidian tests, upgrading Foliate, or changing selection/touch event handling

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
