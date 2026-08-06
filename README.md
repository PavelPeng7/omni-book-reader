# Omni Reader

An all-in-one, local-first EPUB 2/3 reading workbench for Obsidian. It supports paginated and scrolled reading, nested tables of contents, full-book search, reading-position restore, bookmarks, color highlights, and notes attached to highlights.

The default reading typography follows Obsidian's configured text font and font size, then applies a Chinese long-form reading rhythm: 1.7 line height, 0.01em letter spacing, 0.65em paragraph spacing, a 720px text measure, and 48px page margins. Publisher, Chinese serif, and Chinese sans-serif font modes remain available. The typography panel also includes a one-click comfortable-default reset.

The plugin shell uses a Botanical / Organic Serif design system: warm alabaster paper, deep forest text, sage and terracotta accents, editorial serif headings, soft clay cards, pill controls, diffused elevation, and a scoped paper-grain texture. A matching dark botanical palette, reduced-motion behavior, keyboard focus rings, and mobile drawer layout are included. The design remains local-first and does not download web fonts or other interface assets.

Click a highlight in the book, or use its note button in the reader sidebar, to add or edit a note. The plugin keeps a generated Highlight/Note Markdown pair under `<EPUB folder>/<book name>/`, using filenames such as `<book name>-Highlight-2026-08-01.md`. These documents are synchronized whenever highlights or notes change. Use the sidebar export buttons or the command palette to force a refresh and open the exported Markdown document.

Annotations support highlight, underline, strikethrough, and squiggly styles, four colors, notes, and tags. The sidebar can combine tag, chapter, color, and note-status filters, then sort by creation time or chapter. Exported entries include an Obsidian CFI link that reopens the source EPUB at the exact location.

Additional reading tools:

- Footnote and endnote links open an in-reader preview with an optional jump to the referenced position.
- The current chapter can be exported to managed-block Markdown, including its images and annotations. Images are stored in the chapter export `assets` folder.
- Clicking a book image opens a zoom viewer with copy-to-clipboard and save-to-Vault actions.
- Reading statistics track the current session, total active reading time, estimated remaining time, furthest progress, and completion state. Tracking pauses after two minutes without activity.
- Recent Reading is available from the ribbon and command palette for quickly continuing a book without a full bookshelf.
- Focus Paragraph mode dims surrounding text and supports previous/next paragraph navigation with buttons or Arrow Up/Down. Escape exits the mode.

Generated Markdown is written only between `pavel-epub-reader` managed-block comments, so content written outside that block is preserved. Unchanged exports are not rewritten. The settings page offers Classic, Compact, and Obsidian Callout presets. A custom Vault Markdown template can use these variables:

- `{{document.title}}`, `{{document.kind}}`
- `{{book.title}}`, `{{book.author}}`, `{{book.filePath}}`
- `{{export.date}}`, `{{entries}}`

## Development

```powershell
npm install
npm run check
npm test
npm run build
```

The production artifacts loaded by Obsidian are `main.js`, `manifest.json`, and `styles.css`.

To verify and package a release exactly as GitHub Actions does:

```powershell
npm ci
npm run release:check
```

This creates `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` for manual installation or a GitHub Release.

## Release process

1. Update the same semantic version in `manifest.json` and `package.json`.
2. Run `npm run release:check`.
3. Commit, push, then create and push a matching tag such as `0.6.1`.
4. GitHub Actions validates the build and publishes the three plugin files as a GitHub Release.

For a local manual install, copy those three files into `<vault>/.obsidian/plugins/pavel-epub-reader/`, then reload the plugin in Obsidian.

## License

MIT. See [LICENSE](LICENSE). Foliate and bundled dependency notices are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
