# Readable Annotation Export Names

Status: Completed
Date: 2026-09-25

## Scope

Keep each plugin-generated annotation folder and Markdown filename below 100 UTF-8 bytes while making the folder recognizable from the EPUB name. Migrate the previous two-character folder format and legacy export pairs without losing content or links.

## Steps

1. Replace the two-character folder prefix with a byte-truncated book title and retain a collision-resistant suffix.
2. Detect and migrate old short folders as well as long legacy paths; preserve existing file contents and stored paths on failure.
3. Update focused tests, product and design documents, and README.
4. Run quick and full verification and archive this plan.

## Validation

`npx vitest run tests/annotation-documents.test.ts` passed (10 tests). `npm run verify:quick` and `npm run verify:full` passed (85 tests passed, 1 fixture test skipped; production build and release asset validation passed). Tests cover Unicode byte truncation, title recognition, old folder migration, collisions, manual content, and rollback.
