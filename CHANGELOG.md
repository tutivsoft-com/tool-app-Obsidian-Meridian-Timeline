# Changelog

## 3.4.4 — 2026-09-11

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
