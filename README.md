# Omni Book Reader

An all-in-one, local-first EPUB 2/3 reading workbench for Obsidian. It supports paginated and scrolled reading, nested tables of contents, full-book search, reading-position restore, bookmarks, color highlights, and notes attached to highlights.

The default reading typography follows Obsidian's configured text font and font size, then applies a Chinese long-form reading rhythm: 1.7 line height, 0.01em letter spacing, 0.65em paragraph spacing, a 720px text measure, and 48px page margins. Publisher, Chinese serif, and Chinese sans-serif font modes remain available. The typography panel also includes a one-click comfortable-default reset.

The plugin shell uses a Botanical / Organic Serif design system: warm alabaster paper, deep forest text, sage and terracotta accents, editorial serif headings, soft clay cards, pill controls, diffused elevation, and a scoped paper-grain texture. A matching dark botanical palette, reduced-motion behavior, keyboard focus rings, and mobile drawer layout are included. The design remains local-first and does not download web fonts or other interface assets.

Open the bookshelf and choose **Import EPUB**, or use the file menu/command palette to import an EPUB already in your Vault. Import **moves** the original into a per-book folder in the visible `My Reader` library. The bookshelf shows managed books only. Identical EPUB bytes reopen the existing book and leave the duplicate source untouched; different books with the same filename remain separate.

Each book folder contains its EPUB, versioned `book.json` (progress, bookmarks, annotations and statistics), covers, `高亮.md`, `笔记.md`, and chapter exports with local assets. Folder names retain a recognizable book-title prefix and short ID, below 100 UTF-8 bytes. Custom cover images are copied into the folder. Global preferences live in `settings.json` at the library root.

Click a highlight or its sidebar note button to edit a note. Export buttons refresh the managed Markdown pair while preserving handwritten text outside managed blocks. You can rename or move a complete book folder inside the library, or copy it into another Vault's managed library, and retain its fixed book identity and reading data. New position links use that identity; links that name another Vault remain specific to that Vault.

**Library location** in settings moves the complete library to a new or empty Vault folder. Nonempty and overlapping destinations are rejected. Deleting a book asks for confirmation and recycles its **entire folder, including handwritten files inside**. Resolve duplicate book IDs before continuing to write. If files change externally, writes stop instead of overwriting them; inspect the files and reload the plugin to read the external version.

This is a fresh storage format: old reading data, exports and cover caches are not loaded, migrated, restored or automatically cleaned up. Reimport your EPUBs to start using it. Existing Obsidian file synchronization can carry the library, but concurrent edits to one book are not merged; finish syncing before changing devices.

Annotations support highlight, underline, strikethrough, and squiggly styles, four colors, notes, and tags. The sidebar can combine tag, chapter, color, and note-status filters, then sort by creation time or chapter. Exported entries include an Obsidian CFI link that reopens the source EPUB at the exact location.

Selecting text or dragging selection handles keeps the current page in place on desktop and mobile. On Android, a handle stops at the visible page boundary when a paragraph continues onto another page. Click or tap outside the selection to cancel it; page turns then resume. Highlight passages spanning pages separately. **Invert selection colors** in reader settings uses the current reading theme's text color behind selected text and its page color for the selected letters.

Additional reading tools:

- Footnote and endnote links open an in-reader preview with an optional jump to the referenced position.
- The current chapter can be exported to managed-block Markdown, including its images and annotations. Images are stored in the chapter export `assets` folder.
- Clicking a book image opens a zoom viewer with copy-to-clipboard and save-to-Vault actions.
- Reading statistics track the current session, total active reading time, estimated remaining time, furthest progress, and completion state. Tracking pauses after two minutes without activity.
- Recent Reading is available from the ribbon and command palette for quickly continuing a book without a full bookshelf.
- Focus Paragraph mode dims surrounding text and supports previous/next paragraph navigation with buttons or Arrow Up/Down. Escape exits the mode.

Generated Markdown is written only between `omni-book-reader` managed-block comments, so content written outside that block is preserved. Unchanged exports are not rewritten. The settings page offers Classic, Compact, and Obsidian Callout presets. A custom Vault Markdown template can use these variables:

- `{{document.title}}`, `{{document.kind}}`
- `{{book.title}}`, `{{book.author}}`, `{{book.filePath}}`
- `{{export.date}}`, `{{entries}}`

## Development

```powershell
npm install
npm run verify:quick
```

`verify:quick` runs lint, TypeScript checks, and the unit test suite. Before completing a change, run the full gate:

```powershell
npm run verify:full
```

The full gate also creates the production bundle and validates the release metadata and assets. Project specifications, architecture, design decisions, and execution-plan conventions are indexed in [`AGENTS.md`](AGENTS.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), and [`docs/product-specs/index.md`](docs/product-specs/index.md).

The production artifacts loaded by Obsidian are `main.js`, `manifest.json`, and `styles.css`.

To verify and package a release exactly as GitHub Actions does:

```powershell
npm ci
npm run release:check
```

This creates `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` for manual installation or a GitHub Release.
The generated `main.js` is not committed; GitHub Actions builds it and attaches all three files directly to the Release.

## Release process

1. Update the same semantic version in `manifest.json` and `package.json`.
2. Run `npm run release:check`.
3. Commit, push, then create and push a matching tag such as `0.6.1`.
4. GitHub Actions validates the build and publishes the three plugin files as a GitHub Release.

For a local manual install, copy those three files into `<vault>/.obsidian/plugins/omni-book-reader/`, then reload the plugin in Obsidian.

## License

MIT. See [LICENSE](LICENSE). Foliate and bundled dependency notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
