# Meridian Timeline

Version: 3.4.37 — validated locally for publication; Community release pending.

## Current purchase behavior

Purchase settings load the current public product catalog from Constance. Each available offer supplies its exact Paddle price ID, native-unit grant, unit name, and formatted amount. The client displays backend-provided amounts, enables only offers marked available, and submits the selected price ID through authenticated checkout with quantity one. Existing account balances and granted credits remain associated with the account.

## Preview and lifetime allowance

Guests see a bounded preview held only in memory. Keep the originating window open through registration, email verification and sign-in, then retry that exact result without regeneration. Guests cannot save, apply, export or queue useful output. Closing the preview or restarting loses unrevealed guest content.

Constance authorizes metered operations using this app’s native billing unit. The plugin checks current account entitlements and live purchase availability through Constance; each operation follows its documented reserve/commit or quote/confirmation flow.

A bounded timeline snapshot covers up to twenty notes. Full snapshot reveal consumes once; viewing or saving that immutable snapshot does not charge again. Guest scope is limited to twenty notes. File changes prompt explicit refresh rather than automatic useful completion.

Useful local writes follow durable reserve -> write -> verify -> commit. Full reveal commits before showing complete content. Unknown writes retain their journal for status/output reconciliation; they are never blindly refunded or replayed. Billing sends account/install identity, native dimensions and source/result digests, never vault content, image bytes or encryption passwords.

## Current settings

Settings default to **Simple** and remember the selected mode. Simple contains everyday controls and account/billing. **Advanced** adds specialist preferences and diagnostics. This plugin runs locally without a managed AI provider. Account and encryption passwords remain necessary.

## Current local billing source - 30 September 2026

Use **Connect** with an email and password: new users register and verify the email link; existing verified users sign in. Unverified users with the correct password receive a fresh verification link. Passwords are not stored. Use the password-reset control if the password is incorrect.

Constance authenticates linked installations and owns free allowances, paid balances, usage units, and purchase fulfillment. Reinstalling the same app and reconnecting the same account does not replenish its free allowance. Daily policies reset at UTC midnight. Unknown usage and checkout outcomes retain their original journal and identifiers across retries; an alternative checkout is never used to bypass uncertainty. Balances refresh from authenticated entitlements.


Meridian Timeline is a local-first Obsidian plugin that turns dated notes, eras, and historical spans into a readable interactive chronology. It keeps every displayed event connected to its source note.

## MVP features

- Reads configurable frontmatter properties (`date`, `start`, `end`, `created`, and `modified` by default).
- Parses ISO dates, month/day formats, years, decades, approximate dates, BC/BCE labels, and configurable era names.
- Shows point events, spans, approximate dates, uncertain/conflicting dates, and a review list for undated or malformed notes.
- Provides search, folder/tag/type/uncertainty filters, grouping by folder or tag, zoom, fit-all, and source navigation.
- Caches parsed notes and invalidates only changed notes. Initial scans show progress and can be cancelled from the command palette. When notes change, select Refresh to update the timeline.
- Saves named view configurations without modifying source notes.

## Billing and usage


Authenticated entitlements and server usage claims determine balances. Purchase settings fetch provider-backed offers from Constance and show only available rows, using each exact configured price ID. The current approved one-time packs grant 50, 150, 450, or 1,200 timeline operations for USD $2, $4, $8, or $14; client code does not contain price amounts. Authenticated checkout submits the selected ID with quantity one and a persisted idempotency key. Restart recovery and settlement polling reuse that checkout identity. Reinstalling and reconnecting restores the account's existing balance and free allowance. Note content stays in the vault.

Open **Meridian Timeline: Open timeline** from the command palette. Configure properties, ignored folders, content patterns, and era labels in **Settings → Meridian Timeline**.

## Privacy and threat model

Meridian reads and parses notes locally through Obsidian’s vault APIs and does not use AI. Network activity is limited to the Constance entitlement sync, credit spend, and checkout flow described above; note content is never transmitted. Source notes are read-only. Parsed event data is cached in Obsidian plugin data and can include paths, titles, headings, tags, and timestamps; protect the local Obsidian profile accordingly. Ignored folders and path patterns provide an additional boundary for sensitive notes. A malformed note is isolated and reported in Review rather than stopping the scan.

## License

MIT. See [LICENSE](LICENSE).

## Workflow defaults (v3.4.36)

Meridian opens the read-only timeline scan directly. It does not write to notes, so there is no edit approval step.

## Billing and credit feedback

Constance authorizes metered operations using this app’s native billing unit. The plugin checks current account entitlements and live purchase availability through Constance; each operation follows its documented reserve/commit or quote/confirmation flow.


## Manual installation

Download `main.js`, `manifest.json`, and `styles.css` from the matching published release and place them in `.obsidian/plugins/meridian-timeline/`, then enable the plugin in Obsidian.
