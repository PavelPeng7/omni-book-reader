# Annotation Export Paths

Status: Superseded for the managed-library runtime; retained as historical behavior
Date: 2026-09-25

Current runtime behavior is defined by [managed-library storage](managed-library-storage.md). Legacy migration helpers remain tested but are not invoked by the managed-library runtime. The original decision follows for historical context.

## Decision

Keep each generated Highlight/Note folder and filename below 100 UTF-8 bytes. New pairs live beside the source EPUB under a readable folder: retain up to 91 bytes of sanitized EPUB basename, then append `-` and a seven-character base-36 hash of the full vault path and a collision attempt number. Truncate only at Unicode code-point boundaries and remove a dangling partial surrogate from the existing sanitizer's 120-code-unit cap. If a candidate folder already exists, use the next attempt. Each pair uses `高亮.md` and `笔记.md`; `.md` is counted in the limit. Full title, author, and export date remain in the Markdown content and stored metadata.

Stored `annotationDocuments` paths remain the authority for an existing pair. At plugin load, saved books with available EPUB files are migrated before views are registered; the same migration also runs on a book's next sync. A pair with old document filenames, an over-budget component, or the previous two-character folder format moves to the readable paths using `FileManager.renameFile`, which updates links according to Obsidian preferences. If the old folder is an original generated book-name folder or a recognized previous short folder, rename the folder itself before shortening the two export filenames. Any extra files in that folder move with it and their links are updated. If an extra file already uses a target export filename, move only the export pair to a new folder and preserve the old folder to avoid overwriting the extra file. Move both files before changing the stored paths; if the second move fails, roll back the first and the folder move. Persist path changes after each successful migration. Preserve all content outside managed blocks. User-owned parent folders and EPUB filenames are never renamed.

The name limit controls plugin-generated path components; it does not guarantee a maximum total vault path length or resolve every mobile Git synchronization failure.

## Verification

`tests/annotation-documents.test.ts` covers UTF-8 byte limits, Unicode title preservation, repeat sync, migrations of long and previous short names, manual-text preservation, and path collision handling. `npm run verify:quick` and `npm run verify:full` are release gates.
