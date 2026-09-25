# Meridian Timeline Features

Release: 3.4.15

Meridian builds an interactive chronology from dates already stored in an Obsidian vault. Notes remain read-only, and every displayed event links back to its source.

## Timeline and date handling

- Read configurable frontmatter properties, with date, start, end, created, and modified as the defaults.
- Parse supported ISO and common month/day dates, years, decades, approximate dates, BC/BCE labels, and configured era names.
- Show point events, spans, approximate and uncertain dates, and notes with missing or malformed dates in a review list.
- Search and filter by text, folder, tag, date range, event type, and uncertainty.
- Group events by folder or tag, zoom and pan the chronology, fit all events, focus a selected event, and open its source note.

## Refresh and saved views

- Cache parsed note data and invalidate entries when notes change.
- Show progress during a full scan and allow it to be cancelled.
- Refresh the timeline explicitly after edits; Meridian does not silently rewrite source notes.
- Save named view configurations with their filters and settings.

## Local processing and usage

Date parsing, filtering, and rendering run locally through Obsidian APIs. Meridian does not send note contents to Constance. Three successful timeline operations are free per local calendar day; after that, a purchased use is required. Billing and checkout use installation and account metadata over the network.

## Current limits

- Timeline quality depends on usable dates in configured properties or supported date text.
- Ambiguous or malformed values are surfaced for review rather than silently converted to exact dates.
- Meridian is not a calendar, task manager, or automatic note editor.
- AI extraction is not included.

<!-- one-click-workflow:start -->
## Workflow defaults (v3.4.19)

Meridian opens the read-only timeline scan directly. It does not write to notes, so there is no edit approval step.
<!-- one-click-workflow:end -->
