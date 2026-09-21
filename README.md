# Meridian Timeline

Version: `3.4.12`


Meridian Timeline is an offline-first Obsidian plugin that turns dated notes, eras, and historical spans into a readable interactive chronology. It keeps every displayed event connected to its source note.

## MVP features

- Reads configurable frontmatter properties (`date`, `start`, `end`, `created`, and `modified` by default).
- Parses ISO dates, month/day formats, years, decades, approximate dates, BC/BCE labels, and configurable era names.
- Shows point events, spans, approximate dates, uncertain/conflicting dates, and a review list for undated or malformed notes.
- Provides search, folder/tag/type/uncertainty filters, grouping by folder or tag, zoom, fit-all, and source navigation.
- Caches parsed notes and invalidates only changed notes. Initial scans show progress and can be cancelled from the command palette.
- Saves named view configurations without modifying source notes.

## Billing and usage

Meridian uses the TutivSoft Constance unsigned browser-relay credit system for
metered timeline scans. It reads balances through
`POST /api/v1/public/browser/entitlements` and spends through
`POST /api/v1/public/browser/credits/spend`, using the installation identifier
as both `external_customer_id` and `machine_id`. Every installation receives 3 free successful timeline
operations per local calendar day. After the daily allowance is used, one
Constance credit is spent per successful operation. Failed and cancelled scans
do not consume usage. Duplicate opens or refreshes while a scan is running are
coalesced into that one operation, so they cannot double-spend.

The live one-time packs are $1 for 100 uses and $10 for 1,000 uses. Balance sync
and checkout use only the anonymous per-install device identifier; no note
content is sent to Constance. Settings, the read-only quick preview, filters,
zoom, and saved-view configuration never consume usage.

The backend-less plugin does not hold a shared secret, so it does not use signed
headers, server callbacks, or the hosted transaction API. Checkout opens the
Contract v9 `/buy` fallback with the Meridian `app_id`, email, installation ID,
and one-time `price_id`, then polls the public entitlement endpoint because the
fallback has no child-app return URL. The source keeps a defensive placeholder
guard so future catalog changes cannot accidentally open checkout with an
unprovisioned price; these packs have no recurring billing interval.

Open **Meridian: Open timeline** from the command palette. Configure properties, ignored folders, content patterns, and era labels in **Settings → Meridian Timeline**.

## Privacy and threat model

Meridian reads and parses notes locally through Obsidian’s vault APIs and does not use AI. The only network activity is the optional Constance entitlement sync, credit spend, and checkout flow described above; note content is never transmitted. Source notes are read-only. Parsed event data is cached in Obsidian plugin data and can include paths, titles, headings, tags, and timestamps; protect the local Obsidian profile accordingly. Ignored folders and path patterns provide an additional boundary for sensitive notes. A malformed note is isolated and reported in Review rather than stopping the scan.

## Development

```bash
npm install
npm run check
npm run build
```

The uploadable bundle is in `publish/` and contains `main.js`, `manifest.json`, `styles.css`, source, documentation, and the MIT license. Root build configuration stays outside the publish bundle.

## License

MIT. See [LICENSE](LICENSE).
