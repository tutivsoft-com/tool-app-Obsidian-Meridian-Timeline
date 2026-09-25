# Meridian Timeline Software Architecture

Release: 3.4.15

## Runtime shape

Meridian is a TypeScript Obsidian plugin. Its entry point coordinates the timeline view, vault scan, settings, saved views, refresh behavior, and Constance usage checks. Vault parsing, event filtering, presentation, and billing are kept in separate modules.

## Source modules

| Module | Responsibility |
|---|---|
| src/main.ts | Plugin lifecycle, commands, workspace view, vault scan, refresh, event navigation, and coordination of metered operations. |
| src/parser.ts | Parse supported dates and spans, preserve precision and uncertainty, and isolate malformed values. |
| src/filter.ts | Search, folder/tag/date/type filters, and selection of events for display. |
| src/settings.ts | Date properties, ignored paths, view preferences, saved views, and local plugin settings. |
| src/types.ts | Event, scan, settings, and saved-view data contracts. |
| src/plugin-support.ts | Shared setup, diagnostics, and support helpers. |
| src/billing.ts and src/constance-account.ts | Local free-use accounting, installation identity, entitlement sync, spend events, and checkout. |
| src/billing-policy.ts | Pure billing-policy helpers, including local-day free-use calculations. |

## Data flow and privacy boundary

1. Meridian reads note metadata and relevant date text with Obsidian vault APIs.
2. The parser creates local event records that retain the source path and available title, heading, tag, and date context.
3. The view applies the selected filters and renders a navigable chronology. Source notes are not edited.
4. Settings store local preferences, parsed cache data, free-use counts, and saved views.
5. Constance requests carry billing and installation metadata for entitlement, purchased-use, or checkout operations. Note contents are not part of those requests.

## Build and release

The build type-checks the root source and bundles src/main.ts into publish/main.js. The publish directory carries the generated bundle, matching manifest and stylesheet, compatibility map, and release documentation. The root src tree is mirrored into the public repository for source review. The public repository attaches main.js, manifest.json, and styles.css to the exact manifest-version GitHub release.

<!-- one-click-workflow:start -->
## Workflow defaults (v3.4.19)

Meridian opens the read-only timeline scan directly. It does not write to notes, so there is no edit approval step.
<!-- one-click-workflow:end -->
