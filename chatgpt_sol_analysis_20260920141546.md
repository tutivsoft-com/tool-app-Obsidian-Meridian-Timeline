# Meridian implementation analysis

## Reviewed code map

Reviewed `src/main.ts`, timeline canvas/filter workflows, `src/billing.ts`, settings/types, account/support modules, pending spend recovery, and publish inputs.

## Changes and safeguards

- Timeline usage is account-scoped with authenticated entitlement/spend and durable pending events for authoritative retries.
- Free allowance cannot be reset by reinstall; 401/403/404 clears session state and blocks paid execution.
- Sensible date/timeline defaults render a first view without optional rule configuration.
- Canvas navigation and primary filters lead commands; saved views, date rules, appearance, and billing are secondary.

## Threat model and migration

Only installation/account identifiers are sent for billing. Passwords and note contents are not persisted in logs. Stable event IDs prevent double charges during retry/restart.

## Documentation and logging

Help covers timeline commands, date uncertainty, defaults, saved views, account/billing, privacy, troubleshooting, and rollback expectations. Diagnostics cover lifecycle, filtering, rendering, billing, and failures without vault text.

## Validation

Run `npm run check`, `npm run build`, and `git diff --check`; verify public files equal private publish output.

## Remaining limitation

Large-vault rendering and live billing need maintainer-run integration coverage.
