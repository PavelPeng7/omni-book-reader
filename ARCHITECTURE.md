# Omni Book Reader Architecture

This document describes the current production architecture. Update it when a change alters module ownership, data flow, persistence, EPUB processing, or shipped artifacts.

## System context

Omni Book Reader is a local-first Obsidian plugin for EPUB 2/3 files. Obsidian owns the Vault, workspace, commands, and plugin lifecycle. `foliate-js` parses and renders EPUB publications. The plugin stores reader state through Obsidian's plugin data API and writes user-requested Markdown and media exports into the Vault.

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
| State | `src/store.ts`, `src/defaults.ts`, `src/types.ts`, `src/legacy-plugin-data.ts` | Schema, normalization, persistence, defaults, and migration from earlier plugin directories |
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

### Persist reader state

1. UI actions update the in-memory `ReaderDataStore` model.
2. Store normalization protects the persisted schema from malformed, legacy, or out-of-range values.
3. Debounced writes use Obsidian's plugin data storage.
4. The store flushes pending changes at lifecycle boundaries where data loss would otherwise be possible.

The schema is defined in `src/types.ts`. Any schema change must include normalization or migration behavior and tests for old or malformed data.

### Arbitrate selection and navigation

Text selection and reader navigation share touch, pointer, keyboard, and wheel input. Selection has priority whenever a native selection, pending annotation selection, or short selection-settling guard is active.

Edge-assisted selection may advance between pages only while the target remains in the same EPUB spine section. A chapter-boundary decision must happen before calling Foliate navigation so the current selection and viewport do not flash or jump. A post-navigation section check remains as a compatibility fallback when reliable paginator state is unavailable.

Physical left/right input is not the same as logical previous/next content in RTL publications. Direction-sensitive selection and page-turn changes must cover both LTR and RTL behavior. See [`docs/design-docs/systems/reader-selection-navigation.md`](docs/design-docs/systems/reader-selection-navigation.md) for the interaction invariants and test matrix.

### Export annotations and chapters

1. The reader gathers book metadata, CFIs, annotations, and content.
2. Export services render Markdown and copy required media into the Vault.
3. Generated content is constrained by `omni-book-reader` managed-block markers.
4. Existing user-authored content outside managed blocks is preserved, and unchanged exports are not rewritten.

Managed-block preservation is a product invariant. Changes to marker handling require focused regression tests.

## Security and compatibility constraints

- Treat every EPUB as untrusted input. Do not relax sanitizer behavior without tests and an explicit design decision.
- Do not introduce network requirements for core reading or interface assets.
- Preserve Obsidian desktop and mobile support; the manifest is not desktop-only.
- Do not depend on browser behavior that is unavailable in Obsidian's supported runtimes.
- Keep publication content isolated from the plugin shell and Obsidian APIs.
- Preserve user-controlled typography, zoom/reflow, selection, and accessibility behavior.
- Treat native selection as a navigation lock: taps, swipes, keys, wheels, and edge-turn assistance must not accidentally move the viewport while selection is active or settling.
- User-facing UI changes must follow the Botanical / Organic Serif guidance in `AGENTS.md`.

## Build, test, and release

TypeScript under `src/` is bundled by `esbuild.config.mjs` into `main.js`. Obsidian loads exactly these repository-root artifacts:

- `main.js`
- `manifest.json`
- `styles.css`

Vitest runs focused unit and DOM tests under `tests/`. ESLint covers source and package metadata, and TypeScript runs without emitting files.

- `npm run verify:quick`: lint, type-check, and run tests.
- `npm run verify:full`: run the quick gates, create the production bundle, and validate release metadata/assets.
- `npm run release:check`: run the release pipeline and package the three artifacts into `dist/`.

The GitHub release workflow uses Node.js 20 and `npm ci`. Local verification should use a supported Node version declared in `package.json`.

## Change rules

Update this document in the same change when:

- a module gains or loses a system responsibility;
- a persistent field or migration path changes;
- the EPUB trust boundary or external I/O changes;
- build inputs, release artifacts, or verification gates change.

Record feature behavior and acceptance criteria in `docs/product-specs/`. Record implementation decisions and trade-offs in `docs/design-docs/`. Track temporary compromises in `docs/exec-plans/tech-debt.md`.
