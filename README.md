# Meridian Timeline

Build an interactive chronology from dates and event spans in Markdown notes, with optional file modified dates for combined timelines and saved Markdown/JSON outputs.

Current version: **3.4.60**.

## First use

Enable the plugin and use its settings page. Simple is the default settings mode; Advanced exposes optional configuration. Connect the account, then run Open timeline. Use Refresh timeline after editing source notes.

Meridian scans supported configured date properties and patterns, builds a snapshot, then authorizes it before displaying the complete timeline. Filtering, grouping, zooming, opening source notes and saving named views operate on that snapshot. Markdown saving is enabled by default: individual timelines are appended to their source notes, while combined timelines are saved to a dedicated note. Optional companion JSON saving defaults off. Generated sections are excluded from later scans.

## Account and processing

Processing is local. This plugin has no AI provider integration. Constance handles account and billing operations.

A completed timeline operation consumes max(1, ceil(included notes / 20)) units. Reservation and commitment authorize the immutable snapshot. Filtering an already authorized snapshot does not charge again. An unrevealed snapshot pending authorization stays in session memory for retry.

Connect the existing Constance account in settings; registration can require email verification before signing in again. Billing account passwords are sent for authentication and are not persisted. Access/refresh session data and a stable installation identity are saved locally. Account free usage and purchased balance are determined by Constance; cached values and checkout return URLs do not create entitlement. Catalog displays current formatted names, prices, availability and exact price IDs. Unknown usage and checkout results retain their original identities for recovery.

## Diagnostics

Help is available in settings and through Open documentation. Open plugin settings and Copy full debug log are command-palette fallbacks. Debug logging defaults off for a new installation; failures and full Error objects/stacks still appear in the local developer console. Timed information is enabled by the debug preference. The copyable diagnostic buffer keeps at most 1,000 summarized events and excludes raw error text, stacks, note text, paths and credentials. Full console exceptions can contain whatever the failed operation placed in its error. Logs are not uploaded automatically.

## Documentation


License terms are in LICENSE.
