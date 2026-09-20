# Meridian Timeline — Product Requirements

Status: implemented — 3.4.7 release; 3.3.0 MVP baseline

## Product promise

Meridian turns dates and time spans in an Obsidian vault into a readable, interactive chronology while keeping every event connected to its source note.

## Product principles

- Structured metadata is the primary source of truth.
- The timeline must remain useful without AI.
- Ambiguity is displayed honestly rather than converted into false precision.
- Navigation should be faster than building a custom query or diagram.
- The view is read-only by default; source notes are never silently changed.

## MVP data model

1. Read dates from configurable frontmatter properties such as `date`, `start`, `end`, `created`, and `modified`.
2. Read date ranges from supported ISO dates, common year/month/day formats, years, decades, and configurable era labels.
3. Support a single event and an event span with start and end values.
4. Represent unknown precision, approximate dates, open-ended spans, and conflicting dates explicitly.
5. Give each event a source path, title, heading or block context when available, and a stable internal identifier.
6. Provide a review list for notes that contain dates that cannot be parsed or notes that remain undated.
7. Let users configure which folders, properties, and content patterns participate in a view.

## MVP timeline view

8. Open a timeline from the command palette and workspace view.
9. Render an interactive horizontal chronology with pan and zoom.
10. Keep labels readable at different zoom levels and prevent the view from becoming unusable when many events overlap.
11. Show point events, spans, approximate events, and uncertain events with distinct visual treatments.
12. Open the source note when an event is clicked and provide the source heading or block when available.
13. Provide search and filters for text, folder, tag, date range, event type, and uncertainty.
14. Support grouping or coloring by folder, tag, or a selected property.
15. Provide a “fit all” view and a focused view around a selected event.
16. Keep selection and filter state while the user navigates within the view.
17. Refresh changed notes without requiring a full application restart.

## MVP settings and performance

18. Provide a first-run setup with sensible date-property defaults and a small preview.
19. Cache parsed results and invalidate them when source notes change.
20. Show progress for an initial full-vault parse and provide cancellation.
21. Handle malformed dates without blocking all other events.
22. Allow ignored folders and note patterns.
23. Save named view configurations after the basic view is reliable.
24. Keep the view responsive for a large vault by virtualizing or grouping dense event regions as needed.

## AI decision and credit model

AI is optional and useful only for unstructured or ambiguous dates. It may later:

- extract a date or span from prose;
- identify an event title and short description;
- infer a likely date precision or uncertainty explanation;
- suggest a mapping from a custom property to the timeline model.

AI results must be shown as suggestions with confidence and source text, never silently written into notes. The user must explicitly request AI extraction for selected notes or unresolved items. Show estimated credit cost and privacy disclosure before sending content. Charge credits only for the approved request; core parsing, rendering, filtering, and navigation remain free of AI.

## Useful post-MVP features

- BC/BCE and AD/CE support with configurable calendar conventions.
- Repeating events and recurring schedules.
- Multi-lane timelines for people, projects, or locations.
- Dependency and sequence arrows between events.
- Export to SVG, PNG, or shareable Markdown summaries.
- Map and timeline synchronized views when location metadata exists.
- Manual event editing stored in a separate view configuration.
- Local-only AI extraction.

## Out of scope for the MVP

- Automatic rewriting of source notes.
- A full calendar or task-management replacement.
- Claims of historical accuracy for inferred dates.
- Mandatory AI processing or cloud indexing of the vault.

## Acceptance criteria

- A user can open a useful timeline from a vault containing ordinary dated notes without writing a query.
- Clicking any displayed event leads to its source note.
- Zoom, pan, filtering, and search remain usable with a large event set.
- Unknown and ambiguous dates are visibly distinguished from exact dates.
- One malformed note does not prevent the rest of the vault from appearing.
- The complete MVP works offline with AI disabled.
