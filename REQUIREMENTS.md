# Meridian Timeline — Product Requirements

Status: runtime scope implemented through 3.4.14; 3.4.15-3.4.16 are documentation and release-infrastructure only.

## Product promise

Turn dates already stored in an Obsidian vault into a readable, interactive chronology while keeping each event connected to its source note.

## Released requirements

- Read configurable frontmatter properties. Defaults include date, start, end, created, and modified.
- Parse supported ISO and common month/day formats, years, decades, approximate dates, BC/BCE labels, and configured era names.
- Represent point events, spans, uncertainty, approximate precision, and malformed or missing dates without inventing certainty.
- Keep a source path and available title, heading, tag, and date context for displayed events.
- Open a timeline from the command palette, navigate from events to source notes, and refresh the view after edits.
- Search and filter by text, folder, tag, date range, event type, and uncertainty. Group by folder or tag.
- Pan, zoom, fit all events, focus a selection, and save named view configurations.
- Cache parsed data, show full-scan progress, and allow a scan to be cancelled.
- Keep source notes read-only. Parse, filter, and render locally through Obsidian APIs.
- Surface unclear dates for review rather than silently rewriting notes or guessing exact dates.

## Usage and billing

Three successful timeline operations are free per local calendar day. After the allowance is used, the plugin checks and spends purchased uses through TutivSoft Constance. Failed or cancelled scans do not consume a use. Entitlement, spend, and checkout requests use installation and account metadata; note contents are not sent.

The first three free daily operations are tracked locally. Purchased-use verification and checkout require network access.

## Privacy and non-goals

- Do not upload or remotely index vault note contents.
- Do not automatically modify source notes.
- Do not require AI for parsing, filtering, or navigation. AI extraction is not included in the current release.
- Meridian is not a replacement for a calendar, task manager, or project-planning system.
- Do not present approximate or inferred dates as historically verified facts.

## Future considerations

Potential future work includes richer export formats, recurring events, additional grouping modes, and opt-in date suggestions. Any feature that sends selected note text off-device would require explicit user control and a clear privacy disclosure.