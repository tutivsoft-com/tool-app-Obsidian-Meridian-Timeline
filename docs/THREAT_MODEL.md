# Meridian Timeline Threat Model

## Protected data

Vault note contents remain on the device. The local cache may include paths, titles, headings, tags, and date values needed to render event cards. Billing data is separate and may include an installation identifier and account or usage metadata.

## Main risks and controls

- **Unclear or unsupported dates:** Meridian marks them for review instead of claiming exact dates.
- **Stale view after edits:** The user can refresh the scan; source notes are not rewritten.
- **Local profile access:** Protect the Obsidian profile and vault with the device's normal access controls because cached event metadata is stored locally.
- **Billing network activity:** Constance receives billing and installation metadata, not note contents. Purchased-use checks require network access after the daily free allowance.

## Scope

Meridian is a date visualization tool, not a backup or encryption system. It does not assess whether a date is historically correct, and it does not provide AI extraction or automatic note repair.