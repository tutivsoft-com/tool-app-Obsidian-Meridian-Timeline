# Meridian Timeline 3.4.81 desktop acceptance

24 November 2026, Asia/Kolkata. The published Meridian Timeline bundle ran in Obsidian 1.15.1 on Windows. The test used a separate Obsidian profile and a vault of synthetic Markdown notes. The screenshots show that running installation.

The three downloaded release assets matched the public `main` checkout at `286109fd3c4094b35e1fdda5f02bb90bff2ea7ec`. The published tag points to `2946d8534bc7b9b396a221b1fc41de95b1e5ff8b`. [Meridian Timeline 3.4.81 release](https://github.com/tutivsoft-com/tool-app-Obsidian-Meridian-Timeline/releases/tag/3.4.81).

| Asset | SHA-256 |
| --- | --- |
| `main.js` | `274a36e290ad71a04e42bf7a56c2f9026010e5203c83ea439dde41e5b0ea0784` |
| `manifest.json` | `c0835a8d7bbe247914a9e637346f80e9e987f585b24b07784dfca43b3627e443` |
| `styles.css` | `96f475650870fa6342346cb9c99bbb02256f349f192bcdfc107027a09f6c2efa` |

## Issues in the published version

| Issue | Observed in 3.4.81 | Corrected source behavior |
| --- | --- | --- |
| Signed-out balance refresh | Refresh was enabled and returned a connection error when clicked while signed out. Connected refresh succeeded with a test account. | The control explains that users must connect first and enables refresh after they connect. |
| Privacy copy | Settings said notes are never edited. The default individual timeline save added a marked Markdown section to the source note. | Privacy has its own section in both Settings modes and explains the optional note writes. |
| Uncertainty filter | “uncertain only” showed both approximate and uncertain events. | The label names both categories. |
| Help and offer guidance | Help mentioned a timeline Undo action and directed users to Account for current prices. Offers rendered in Buy credits. | Help directs users to source notes and Buy credits. |
| Dates embedded in identifiers | The string `release2024` generated a `2024` event. A standalone `1990–1995` span also rendered. | Automatic scanning drops the identifier fragment and retains the span. |
| Custom date navigation | A custom pattern for `epoch: 44 BCE` created the event. The event opened the note at line 13 instead of the matching line 6. | The event opens the source at the matched date line. |

The corrections passed source validation. Availability in Community plugins requires an approved release.

## Desktop checks

| Area | Observed |
| --- | --- |
| Settings | Enabled the plugin after Obsidian's trust prompt. Exercised Simple and Advanced, both save preferences, automatic windows, debug logging, date properties, custom patterns, era labels, ignored folders and paths, and all four event limits. |
| Help and diagnostics | Expanded all five Help sections, opened Account from both Help shortcuts, and opened the timeline from Help. Used the palette to open documentation and settings and to toggle debug logging. Both diagnostic copy controls wrote to a test clipboard. |
| Account and billing | Exercised verification-pending registration, connecting, recovery and resend requests, USD offers, catalog failure and recovery, balance refresh, two purchase options, manual status check, cancellation and fulfillment. Account, authorization, checkout and settlement responses were synthetic. |
| Timeline | Ran Combined and Each note, verified date and file-modified events, searched, and exercised folder, tag, event type and uncertainty filters, all grouping options, event navigation, focus, zoom and Fit all. Saved, restored and deleted a named view. |
| Scope, files and retries | Used folder, nested note, file and editor menus. Both multi-selection modes used the same two selected notes. Verified generated Markdown and companion JSON, JSON-only and saving-disabled modes, manual save without a new reservation, sidebar and palette refresh, no duplicate Markdown section, cancellation before reservation, and denial followed by a successful retry. |
| Local lifecycle | Signed out. Disabled and re-enabled the same package using Obsidian's switch. The optional Welcome window appeared and the test preferences remained visible. Uninstall removed the local plugin and retained the synthetic notes and exports. |

The run covered Windows desktop. Live email delivery, real provider payments, and mobile operation were outside its scope.

## Screenshots

1. [Signed-out account](screenshots/01-signed-out-account.png)
2. [Expanded Help](screenshots/02-expanded-help.png)
3. [Optional Welcome after re-enabling the plugin](screenshots/03-automatic-welcome.png)
4. [Privacy disclosure and installed version](screenshots/04-privacy-and-version.png)
5. [Synthetic checkout status and payment controls](screenshots/05-checkout-progress.png)
6. [Combined and individual timeline chooser](screenshots/06-timeline-mode-chooser.png)
7. [Combined timeline and its filters](screenshots/07-combined-timeline.png)
8. [Approximate and uncertain events under the uncertainty filter](screenshots/08-uncertainty-filter.png)
9. [Save timeline view dialog](screenshots/09-save-named-view.png)
10. [Individual timeline beside a source note](screenshots/10-individual-note-timeline.png)
