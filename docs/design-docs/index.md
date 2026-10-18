# Design Documents

Design documents explain how and why a change is implemented. Product behavior belongs in [`../product-specs/`](../product-specs/), while the current system map belongs in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md).

## Current design sources

- [`file-organization-discovery.md`](file-organization-discovery.md): completed file organization interview and confirmed decisions, published as Issue #9.
- [`systems/managed-library-storage.md`](systems/managed-library-storage.md): implemented managed-library storage, per-book ownership, portable resources, safe relocation, compatibility trade-offs and automated verification; native acceptance tracked separately.

- [`ux-discovery.md`](ux-discovery.md): mobile annotation UX interview, confirmed Android selection behavior, and remaining candidate improvements.

- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md): runtime boundaries, core flows, invariants, build, and release model.
- [`../../AGENTS.md`](../../AGENTS.md): repository workflow and user-interface design constraints.
- [`systems/reader-selection-navigation.md`](systems/reader-selection-navigation.md): selection ownership, navigation arbitration, chapter boundaries, directionality, and regression coverage.
- [`systems/annotation-export-paths.md`](systems/annotation-export-paths.md): short generated annotation paths and existing-document migration.
- [`systems/release-artifacts.md`](systems/release-artifacts.md): tagged source, generated bundle, attached assets, and remote verification.
- [`../obsidian-review-versions-json.md`](../obsidian-review-versions-json.md): investigation notes for the Obsidian review requirement around `versions.json`.

## When a design document is required

Write a focused design document before or alongside implementation when a change:

- crosses multiple runtime areas;
- changes stored data or migration behavior;
- changes EPUB loading, sanitization, or the content trust boundary;
- adds a dependency or external I/O;
- changes managed export formats;
- introduces a trade-off that a future maintainer should not have to rediscover.

Small, local changes can record their rationale in the active execution plan instead.

## Suggested template

```markdown
# Decision or System Name

Status: Proposed | Accepted | Superseded
Date: YYYY-MM-DD

## Context
What problem and constraints led to this work?

## Decision
What will be built, and where are the boundaries?

## Alternatives considered
What credible alternatives were rejected, and why?

## Consequences
What becomes easier, harder, or riskier?

## Validation
Which automated and manual checks prove the decision works?
```

Prefer durable facts and trade-offs over implementation narration. Update or supersede a document when its decision is no longer current.
