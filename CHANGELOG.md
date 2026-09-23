# Changelog

## 3.4.14 - 2026-09-23

- Simplified Obsidian command palette labels by removing repeated plugin-name prefixes.

## 3.4.13 - 2026-09-23

- Avoid a second billed scan when revealing an open timeline and stop automatic scans after note edits. Refresh explicitly to update changed notes.
- Retry unsettled credit spends before balance sync and clarify scan usage in settings.

## 3.4.12 - 2026-09-22

- Reconciled the backend-less Constance browser-relay integration with Contract v9.

## 3.4.11 - 2026-09-21

- Incremented release metadata without rebuilding the plugin.

## 3.4.7 — 2026-09-20

- Prepared the next patch version across source, publish, and public metadata.
- No runtime behavior changed in this documentation and version bump.

## 3.4.6 — 2026-09-20

- Synchronized the Meridian source and publish version surfaces and prepared
  the next source-inclusive TutivSoft release.

## 3.4.4 — 2026-09-11

## 3.4.10 - 2026-09-21

- Incremented the release version and synchronized the source-inclusive public artifact.
- Verified build, tests, syntax, and release metadata before publication.

- Release: carried the live Meridian billing catalog into the 3.4.4 source and publish artifacts with the verified $1/100-use and $10/1,000-use prices.

## 3.4.3 — 2026-09-11

- Billing/live catalog: configured Meridian’s provisioned live prices for $1/100 uses (`pri_01m28hmpn9ze05g1fg490xp9f8`) and $10/1,000 uses (`pri_01m28hmqn785817mzy2tfa89kz`).

## 3.4.2

- Activated the provisioned live Constance/Paddle prices for the $1/100-use and $10/1,000-use packs.
- Updated billing catalog documentation and publish metadata for the live checkout release.

## 3.4.1

- Meter only successfully completed timeline operations; cancelled or failed scans do not consume usage.
- Coalesce duplicate in-flight opens/refreshes and serialize billing requests to prevent concurrent double-spend or stale balance overwrites.
- Harden balance parsing, checkout validation, and cryptographically random event IDs while keeping Paddle price placeholders disabled.
- Added billing-policy tests and synchronized the publish mirror/version surfaces.

## 3.4.0

- Added Constance usage metering with 3 free timeline scans per local calendar day.
- Added purchased-use balance sync and checkout slots for $1/100 uses and $10/1,000 uses.
- Added billing settings, explicit privacy disclosure, and provisioning-safe Paddle ID handling.
- Kept note parsing and rendering local; no note content is sent to Constance.
