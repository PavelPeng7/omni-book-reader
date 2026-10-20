# Omni Book Reader Architecture

This document describes the current production architecture. Update it when a change alters module ownership, data flow, persistence, EPUB processing, or shipped artifacts.

## System context

Omni Book Reader is a local-first Obsidian plugin for EPUB 2/3 files. Obsidian owns the Vault, workspace, commands, and plugin lifecycle. `foliate-js` parses and renders EPUB publications. The plugin stores reader settings and per-book state in a visible managed library in the Vault, alongside EPUBs, covers, and Markdown/media exports. A separate installation-local location file bootstraps the library without reading or overwriting legacy plugin data.

The plugin does not require a backend service. EPUB content, reading state, annotations, and exports remain local unless the user's Obsidian setup synchronizes them externally.

## Runtime structure

| Area | Primary modules | Responsibility |
| --- | --- | --- |
| Plugin shell | `src/main.ts` | Lifecycle, view registration, commands, protocol links, settings, and cross-view coordination |
| Reader | `src/reader-view.ts`, `src/reader-ui-state.ts`, `src/mobile-input.ts` | Reading UI, navigation, selection, annotations, overlays, mobile input, and reading statistics |
| Bookshelf | `src/bookshelf-view.ts`, `src/epub-cover.ts` | Vault EPUB discovery, cover extraction, filtering, sorting, and book management |
| EPUB pipeline | `src/epub-loader.ts`, `src/epub-binary.ts`, `src/foliate-*.ts`, `src/blob-url-*.ts` | Load publications, normalize blob-backed resources, and adapt Foliate behavior for Obsidian desktop/mobile runtimes |
| Safety boundary | `src/sanitizer.ts` | Remove executable or remote publication content before it enters the rendered document |
| Layout and appearance | `src/reader-layout.ts`, `src/reader-style.ts`, `src/settings-ui.ts`, `styles.css` | Reader layout, publication CSS, user settings, and the plugin design system |
| State | `src/managed-library.ts`, `src/store.ts`, `src/defaults.ts`, `src/types.ts` | Managed library, stable identity, per-book persistence, normalization, and defaults; legacy import helpers are not called by the runtime |
| Exports | `src/annotation-documents.ts`, `src/chapter-export.ts`, `src/media-utils.ts` | Managed Markdown documents, chapter exports, images, filenames, and Vault writes |
| Utilities | `src/i18n.ts`, `src/search-session.ts`, `src/utils.ts` | Localization, stale-search protection, identifiers, paths, and shared guards |

Keep modules focused. `main.ts` coordinates Obsidian integration; it should not absorb reader or persistence implementation. `reader-view.ts` is currently the largest integration surface, so new independently testable behavior should normally live in a focused module and be called from the view.

## Core flows

### Open and render a book

1. Obsidian routes an `.epub` file to `OmniBookReaderView` through `src/main.ts`.
2. The reader loads the local file and constructs a Foliate publication.
3. Runtime adapters normalize blob-backed markup and resources across desktop and mobile.
4. The sanitizer removes dangerous elements, URLs, and unsupported publication behavior.
5. The reader applies user layout and typography settings, restores the saved position, and renders navigation state.

### Manage books and persist reader state

1. The user explicitly imports a Vault EPUB. ManagedLibrary compares current binary content, reuses an identical managed book without moving the duplicate, or moves a new EPUB into a readable title/short-ID folder under the configurable `My Reader` root.
2. A versioned per-book document stores the full stable bookId, relative EPUB reference, content digest, metadata, progress, annotations, bookmarks and statistics. Global settings have their own versioned document in the root; plugin-local `library-location.json` only bootstraps that root. Existing `data.json` and old exports/caches are left untouched.
3. ReaderDataStore retains the established path-based in-memory API for reader integration. ManagedLibrary projects that API onto stable book identities and per-book documents; folder-relative references are serialized at the storage boundary and resolved on discovery. `reconcile` preserves live reader object identity while retargeting paths or loading refreshed state.
4. Debounced writes, exports, cover writes, imports, whole-book trash and root moves share a serialized library operation queue. Persistence checks identities and expected on-disk text before writing; external changes, invalid JSON and duplicate identities cannot be silently overwritten. Healthy books can still save when another book is invalid.
5. Vault rename/create/delete events rebase live paths and debounce rediscovery. Whole-book trash closes matching readers and flushes final activity before recycling the entire directory. Queued obsolete snapshots cannot recreate removed books.

6. Root relocation flushes pending writes, rejects nonempty or overlapping targets, renames the complete library and then commits the new root. A pending-root bootstrap journal recovers an interrupted rename on startup; ordinary failures roll back. Empty target directories may be recycled through Obsidian before the move.

Initialization is an explicit store state. A failed initial read retains its original error and blocks all persistence of fallback defaults; Vault events do not discover books into that failed store. The plugin retries initialization after workspace layout readiness, and an explicit library refresh can retry later. Recovery reloads persisted settings/state before resuming reader leaves and ordinary flush/discovery. Concurrent recovery requests share the same load, and unloading cancels deferred startup work.

The on-disk managed-library format is version 1. The ReaderData schema in memory remains a normalization facade, not the old on-disk persistence format. New-format errors are isolated and preserved; earlier plugin-directory recovery and export-path migrations are deliberately not run. See [managed-library design](docs/design-docs/systems/managed-library-storage.md).

### Arbitrate selection and navigation

Text selection and reader navigation share touch, pointer, keyboard, and wheel input. Selection always has priority whenever a native selection, pending annotation selection, or short selection-settling guard is active. Legacy `preventPageTurnsWhileSelecting` values are discarded by normalization.

Touch selection-handle drags and desktop mouse or pen selection never navigate, including at page edges. The plugin does not schedule page turns from selection edges, and its capture-phase `selectionchange` handler prevents Foliate from scheduling selection-driven pagination in reflowable paginated content. Queued ordinary navigation checks selection state again before each turn. A click or tap outside an active selection consumes that input, clears selection, and permits later ordinary navigation. `invertSelectionColors` only affects publication `::selection` styling and defaults off.

Physical left/right input is not the same as logical previous/next content in RTL publications. Direction-sensitive page-turn changes must cover both LTR and RTL behavior. See [`docs/design-docs/systems/reader-selection-navigation.md`](docs/design-docs/systems/reader-selection-navigation.md) for the interaction invariants and test matrix.

### Export annotations and chapters

1. The reader gathers book metadata, CFIs, annotations, and content.
2. Export services render Markdown and copy required media into the Vault.
3. Generated content is constrained by `omni-book-reader` managed-block markers.
4. Existing user-authored content outside managed blocks is preserved, and unchanged exports are not rewritten.

Managed-block preservation is a product invariant. Changes to marker handling require focused regression tests.

`AnnotationDocumentService` receives the managed book folder from the library and writes `高亮.md` and `笔记.md` there, without legacy path migration. Chapters, local assets, and saved book images also remain inside the same book folder. Custom covers are copied into that folder while their source images remain untouched. Stored resource associations and chapter assets use relative paths; new CFI links use bookId plus source-Vault metadata. Existing Vault-specific links in copied documents are not rewritten across Vaults. Generated per-book directory names remain below 100 UTF-8 bytes, while user-owned parent paths and original EPUB names are preserved.

## Security and compatibility constraints

- Treat every EPUB as untrusted input. Do not relax sanitizer behavior without tests and an explicit design decision.
- Do not introduce network requirements for core reading or interface assets.
- Preserve Obsidian desktop and mobile support; the manifest is not desktop-only.
- Do not depend on browser behavior that is unavailable in Obsidian's supported runtimes.
- Keep publication content isolated from the plugin shell and Obsidian APIs.
- Preserve user-controlled typography, zoom/reflow, selection, and accessibility behavior.
- Treat native selection as a navigation lock: taps, swipes, keys, and wheels must not accidentally move the viewport while selection is active or settling.
- User-facing UI changes must follow the Botanical / Organic Serif guidance in `AGENTS.md`.

## Build, test, and release

TypeScript under `src/` is bundled by `esbuild.config.mjs` into `main.js`. Obsidian loads exactly these repository-root artifacts:

- `main.js`
- `manifest.json`
- `styles.css`

`main.js` is generated locally and ignored by Git. A tagged source commit contains the build inputs; the release workflow creates `main.js` and attaches it directly to the GitHub Release with `manifest.json` and `styles.css`. See [`docs/design-docs/systems/release-artifacts.md`](docs/design-docs/systems/release-artifacts.md).

Vitest runs focused unit and DOM tests under `tests/`. ESLint covers source and package metadata, and TypeScript runs without emitting files.

- `npm run verify:quick`: lint, type-check, and run tests.
- `npm run verify:full`: run the quick gates, create the production bundle, and validate release metadata/assets.
- `npm run release:check`: run the release pipeline and package the three artifacts into `dist/`.

The GitHub release workflow uses Node.js 20 and `npm ci`. Local verification should use a supported Node version declared in `package.json`.
After uploading release files, the workflow also checks that GitHub's release-by-tag API consistently exposes `main.js`, `manifest.json`, and `styles.css`. This remote check catches releases whose assets exist by release ID but appear missing to version-based consumers.

New release tags include `docs/release-notes/<version>.md`; the workflow publishes those upgrade instructions with the release, including any incompatible storage changes.

## Change rules

Update this document in the same change when:

- a module gains or loses a system responsibility;
- a persistent field or migration path changes;
- the EPUB trust boundary or external I/O changes;
- build inputs, release artifacts, or verification gates change.

Record feature behavior and acceptance criteria in `docs/product-specs/`. Record implementation decisions and trade-offs in `docs/design-docs/`. Track temporary compromises in `docs/exec-plans/tech-debt.md`.
