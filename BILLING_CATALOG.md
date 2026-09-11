# Meridian Timeline billing catalog

Target Constance app entry:

- App ID: `meridian-timeline`
- Environment: `live`
- Active: `Yes`
- Unit: `uses`
- Browser credit spend: `Yes`
- Free allowance: 3 successful timeline operations per local calendar day, tracked locally per installation

Live one-time Paddle products:

| Price | Uses | Paddle price ID |
| --- | ---: | --- |
| $1 | 100 | `pri_01m28hmpn9ze05g1fg490xp9f8` |
| $10 | 1,000 | `pri_01m28hmqn785817mzy2tfa89kz` |

The plugin uses Constance’s unsigned public browser-relay endpoints for
entitlement lookup, credit spend, and checkout. Successful operations are
metered only after a scan completes; failed/cancelled scans and read-only
configuration do not consume usage. Duplicate in-flight scans are coalesced.
Do not add Paddle API keys or private credentials to this repository. The IDs
above are the verified live catalog values; keep the two source and publish
maps aligned if the catalog is changed later.
