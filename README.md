# Meridian Timeline

Version: 3.4.38

## Current purchase behavior

Purchase settings load the current public product catalog from Constance. Each available offer supplies its exact Paddle price ID, native-unit grant, unit name, and formatted amount. The client displays backend-provided amounts, enables only offers marked available, and submits the selected price ID through authenticated checkout with quantity one. Existing account balances and granted credits remain associated with the account.

## Preview and lifetime allowance

Guests see a bounded preview held only in memory. Keep the originating window open through registration, email verification and sign-in, then retry that exact result without regeneration. Guests cannot save, apply, export or queue useful output. Closing the preview or restarting loses unrevealed guest content.

Constance authorizes metered operations using this app’s native billing unit. The plugin checks current account entitlements and live purchase availability through Constance; each operation follows its documented reserve/commit or quote/confirmation flow.

A bounded timeline snapshot covers up to twenty notes. Full snapshot reveal consumes once; viewing or saving that immutable snapshot does not charge again. Guest scope is limited to twenty notes. File changes prompt explicit refresh rather than automatic useful completion.

Useful local writes follow durable reserve -> write -> verify -> commit. Full reveal commits before showing complete content. Unknown writes retain their journal for status/output reconciliation; they are never blindly refunded or replayed. Billing sends account/install identity, native dimensions, and source/result digests; it never sends note content.

## Current settings

Settings default to **Simple** and remember the selected mode. Simple contains everyday controls and account/billing. **Advanced** adds specialist preferences and diagnostics. This plugin runs locally without a managed AI provider. Connect a Constance account to refresh balances and authorize metered operations. Meridian does not encrypt note data.

## Constance account and usage

Use **Connect** with your Constance account. New users verify the emailed link, then connect again; existing verified users sign in. Passwords are not saved by Meridian. Constance owns the lifetime starter allowance, purchased balances, usage authorization, and checkout fulfillment. Reinstalling and reconnecting the same account does not reset its allowance. Usage and checkout retries reuse their original identifiers rather than starting a duplicate operation.

Meridian Timeline is a local-first Obsidian plugin that turns dated notes, eras, and historical spans into a readable interactive chronology. It keeps every displayed event connected to its source note.

## MVP features

- Reads configurable frontmatter properties (`date`, `start`, `end`, `created`, and `modified` by default).
- Parses ISO dates, month/day formats, years, decades, approximate dates, BC/BCE labels, and configurable era names.
- Shows point events, spans, approximate dates, uncertain/conflicting dates, and a review list for undated or malformed notes.
- Provides search, folder/tag/type/uncertainty filters, grouping by folder or tag, zoom, fit-all, and source navigation.
- Caches parsed notes and invalidates only changed notes. Initial scans show progress and can be cancelled from the command palette. When notes change, select Refresh to update the timeline.
- Saves named view configurations without modifying source notes.

## Billing and usage


Authenticated entitlements and server usage claims determine balances. Current offer amounts, grants, descriptions, and availability come from Constance; Meridian displays only available offers and submits the selected exact price ID. Checkout uses quantity one and a persisted idempotency key, and restart recovery reuses that checkout identity. Reinstalling and reconnecting preserves the account's balance and free allowance. Note content stays in the vault.

Open **Meridian Timeline: Open timeline** from the command palette. Configure properties, ignored folders, content patterns, and era labels in **Settings → Meridian Timeline**.

## Privacy and threat model

Meridian reads and parses notes locally through Obsidian’s vault APIs and does not use AI. Network activity is limited to the Constance entitlement sync, credit spend, and checkout flow described above; note content is never transmitted. Source notes are read-only. Parsed event data is cached in Obsidian plugin data and can include paths, titles, headings, tags, and timestamps; protect the local Obsidian profile accordingly. Ignored folders and path patterns provide an additional boundary for sensitive notes. A malformed note is isolated and reported in Review rather than stopping the scan.

## License

MIT. See [LICENSE](LICENSE).

## Workflow defaults (v3.4.38)

Meridian opens the read-only timeline scan directly. It does not write to notes, so there is no edit approval step.

## Billing and credit feedback

Constance authorizes metered operations using this app’s native billing unit. The plugin checks current account entitlements and live purchase availability through Constance; each operation follows its documented reserve/commit or quote/confirmation flow.


## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the matching published release and place them in `.obsidian/plugins/meridian-timeline/`, then enable the plugin in Obsidian.
