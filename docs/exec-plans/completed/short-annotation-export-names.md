# Short Annotation Export Names

Status: Completed
Date: 2026-09-25

## Scope

Keep every plugin-created annotation folder and Markdown document filename under ten Unicode characters, including `.md`. Apply the naming rule to new exports and migrate existing managed Highlight/Note pairs at plugin load or their next sync without losing user-authored content outside managed blocks.

## Steps

1. Replace book-title/date-derived paths with stable short per-book folders and fixed short document names.
2. Migrate existing annotation document pairs safely, reject destination conflicts, and preserve path references.
3. Add regression tests for long titles, repeated sync, existing documents, and collisions.
4. Update product, architecture, design, and README; run quick and full verification.

## Risks

- Existing export paths may be linked from user notes; Obsidian's vault rename updates files but link behavior needs validation.
- User-owned parent folders and EPUB filenames are outside this generated-name constraint.

## Validation

`npx vitest run tests/annotation-documents.test.ts` passed (8 tests). `npm run verify:quick` and `npm run verify:full` passed (83 tests passed, 1 fixture test skipped; production build and release asset validation passed). `git diff --check` passed. Folder and document naming, startup migration, collisions, manual content, and rollback are covered by the focused tests. A conflicting user-owned `高亮.md` or `笔记.md` leaves the legacy folder in place; tracked in TD-2026-004.
