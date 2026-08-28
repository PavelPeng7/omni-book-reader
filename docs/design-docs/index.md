# Design Documents

Design documents explain how and why a change is implemented. Product behavior belongs in [`../product-specs/`](../product-specs/), while the current system map belongs in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md).

## Current design sources

- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md): runtime boundaries, core flows, invariants, build, and release model.
- [`../../AGENTS.md`](../../AGENTS.md): repository workflow and user-interface design constraints.
- [`systems/reader-selection-navigation.md`](systems/reader-selection-navigation.md): selection ownership, navigation arbitration, chapter boundaries, directionality, and regression coverage.
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
