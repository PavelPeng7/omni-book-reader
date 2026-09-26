# Product Specifications

This directory is the source of truth for user-visible behavior and acceptance criteria. Keep implementation detail in `../design-docs/` and system boundaries in [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md).

## Product summary

Omni Book Reader is a local-first EPUB 2/3 reading workbench inside Obsidian. It helps users discover EPUB files in their Vault, read them on desktop and mobile, retain progress, annotate passages, and export durable Markdown without requiring a remote service.

## Current product capabilities

| Capability | Expected behavior |
| --- | --- |
| Library | Discover local EPUB files, display a bookshelf, filter/sort books, customize covers, and continue recent reading |
| Reading | Support paginated and scrolled layouts, table-of-contents navigation, search, position restore, appearance settings, and focus paragraph mode |
| Input | Support keyboard, touch, swipe, and mobile page-turn controls without breaking text selection or editable controls |
| Annotations | Create bookmarks, highlights, underlines, strikethroughs, squiggles, notes, colors, and tags; filter and sort saved annotations; optionally keep text selection and selection-handle drags on the current page on desktop and mobile |
| Exports | Produce managed Highlight/Note Markdown documents and chapter Markdown with local assets while preserving user content outside managed blocks |
| Reading history | Track active session time, furthest progress, completion, estimated remaining time, and recent books |
| Integration | Open `.epub` files as an Obsidian view and reopen exact locations through `obsidian://omni-book-reader` CFI links |
| Localization | Provide Chinese and English plugin interface text |

The [`README.md`](../../README.md) is the user-facing feature overview. When behavior changes, update the specification first or in the same change, then keep the README aligned.

## Product invariants

- Reading and annotation work locally without a required account or network service.
- EPUB input is untrusted and must be sanitized before rendering.
- Exports never overwrite user-authored text outside plugin-managed blocks.
- Saved state is normalized so malformed or legacy data does not prevent the plugin from loading.
- Reader settings preserve legibility, selection, zoom/reflow, keyboard access, and mobile use.
- The "Prevent page turns while selecting" reader option is enabled by default and available in both settings interfaces. When enabled, a native or pending text selection owns navigation until it is saved or cancelled on desktop and mobile; selection drags in any direction never turn paginated pages or repeat page turns, and clicking outside the selection cancels it.
- When the option is disabled, selection-based navigation is handed back to Foliate and ordinary page-turn controls are no longer blocked solely by a selection. Clicking outside a pending selection still dismisses it.
- With the option enabled, Android vertical selection-handle drags remain on the current page even away from horizontal edges and after release; dependency-level selection-change navigation must obey this constraint too. Cross-page passages are highlighted in separate selections.
- While an Android selection handle remains held, crossing a paginated paragraph boundary must not scroll the publication viewport or Foliate page container, including when the native range briefly collapses.
- With protection enabled, an Android selection handle that reaches text on another paginated page stays at the current page's first or last visible text position; the selected passage remains usable on the current page.
- Interface changes remain coherent with the Botanical / Organic Serif system in [`../../AGENTS.md`](../../AGENTS.md).
- Production releases contain a non-empty `main.js`, `manifest.json`, and `styles.css` with consistent versions.

## Acceptance baseline

A change is complete when:

1. Its user-visible behavior and edge cases are reflected here or in a linked feature specification.
2. Architecture or implementation decisions are updated when boundaries or constraints change.
3. Automated tests cover logic with meaningful regression risk.
4. `npm run verify:quick` passes during development.
5. `npm run verify:full` passes before completion.
6. The active execution plan and technical-debt register reflect the final state.

## Adding a feature specification

For a substantial feature, create `features/<feature-name>.md` with:

- problem and target user;
- goals and non-goals;
- user flow and expected states;
- acceptance criteria and edge cases;
- accessibility, mobile, privacy, and compatibility constraints;
- links to its design document and active execution plan.

Add the new document to an index in this file so specifications remain discoverable.
