# Release attestation

Meridian Timeline release artifacts are built from the source repository by the GitHub Actions workflow in `.github/workflows/release-attestation.yml`. This public mirror carries the final reviewable source and root release bundle. Billing catalog provisioning is tracked separately in `BILLING_CATALOG.md`; no billing secret or Paddle API credential belongs in this repository.

## 2026-09-11 billing/live catalog

Meridian’s live catalog uses `pri_01m28hmpn9ze05g1fg490xp9f8` for $1/100 uses and `pri_01m28hmqn785817mzy2tfa89kz` for $10/1,000 uses. The source and publish checkout maps are aligned.

## 2026-09-11 release 3.4.4

The 3.4.4 release carries the live billing catalog into the rebuilt release artifacts; no configured price placeholder is present. The GitHub release includes `main.js`, `manifest.json`, and `styles.css`.
