# Meridian Timeline

Meridian Timeline is an offline-first Obsidian plugin that turns dated notes, eras, and historical spans into a readable interactive chronology. It keeps every displayed event connected to its source note.

## MVP features

- Reads configurable frontmatter properties (`date`, `start`, `end`, `created`, and `modified` by default).
- Parses ISO dates, month/day formats, years, decades, approximate dates, BC/BCE labels, and configurable era names.
- Shows point events, spans, approximate dates, uncertain/conflicting dates, and a review list for undated or malformed notes.
- Provides search, folder/tag/type/uncertainty filters, grouping by folder or tag, zoom, fit-all, and source navigation.
- Caches parsed notes and invalidates only changed notes. Initial scans show progress and can be cancelled from the command palette.
- Saves named view configurations without modifying source notes.

Open **Meridian: Open timeline** from the command palette. Configure properties, ignored folders, content patterns, and era labels in **Settings → Meridian Timeline**.

## Privacy and threat model

Meridian works entirely through Obsidian’s local vault APIs. It makes no network requests, sends no note content, and does not use AI. Source notes are read-only. Parsed event data is cached in Obsidian plugin data and can include paths, titles, headings, tags, and timestamps; protect the local Obsidian profile accordingly. Ignored folders and path patterns provide an additional boundary for sensitive notes. A malformed note is isolated and reported in Review rather than stopping the scan.

## Development

```bash
npm install
npm run check
npm run build
```

The uploadable bundle is in `publish/` and contains `main.js`, `manifest.json`, `styles.css`, source, documentation, and the MIT license. Root build configuration stays outside the publish bundle.

## License

MIT. See [LICENSE](LICENSE).
