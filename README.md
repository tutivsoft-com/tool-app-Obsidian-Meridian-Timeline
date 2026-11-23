# Meridian Timeline

Build timelines from dated notes and save the selected timeline output.

## Use

Install or update Meridian Timeline through Obsidian Community plugins, enable it, and connect your Constance account in the plugin settings to run a scan. The default date properties are `date`, `start`, `end`, `created`, and `modified`. Use a date such as `2026-11-20` in your note properties.

- Run **Open timeline** from the command palette to scan eligible notes across the vault.
- Use **Meridian: Timeline from this note** in a note's context menu to scan that note. For selected notes or folders, choose a combined timeline or a separate timeline for each note. The combined timeline also includes file modification times. Selected folders include eligible Markdown notes in their subfolders.
- Use **Refresh timeline** after changing source notes. The scan uses free credits first, then purchased credits. Viewing the same scan again uses no additional credits.

Meridian saves Markdown automatically after a successful scan by default. It writes a combined timeline to a dedicated note and adds individual timelines to a marked section in each source note. Enable **Save companion JSON** in settings to save a `.meridian-timeline.json` file beside each timeline note. If saving fails, use **Save timeline files** to retry without running another scan.

## Account and billing

If you create a Constance account, confirm your email and select **Connect** again in plugin settings. Constance manages sign-in, free allowance, purchased credits and payment confirmation.

Check your balance under **Account** and current USD offers under **Buy credits**. Offers and prices come from Constance. Reopen settings to reload the offers if pricing is unavailable. Complete payment in your browser, then follow the status under the offers. During checkout, status checks start after three seconds and repeat about every five seconds for up to five minutes. Use **Check payment** if confirmation is still pending or **Cancel current purchase** when it is available. A retry or restart keeps the original purchase. Wait for the plugin to confirm payment and update your balance before buying again.

## Privacy and recovery

Meridian parses notes and saves timeline files on your device. Account and purchase requests go to Constance, and scan authorization sends the number of credits to use. The plugin keeps session credentials and recovery records in local settings. It does not save your password. Basic usage events go to Matomo without note contents. Automatic startup and error reports go to Datadog separately from the local diagnostic log. Reports include the plugin version and platform. Error reports can also include recent action names and error details, including file paths or content. The plugin masks recognizable credential patterns in those details.

Uncertain older billing records are retained and are never replayed as new v2 charges. Connect the original account and contact support if an earlier operation needs recovery.

## Version 3.4.81

Fix timeline date parsing, tag discovery, and inclusive end dates.

Requires Obsidian 1.5.0 or later. [GitHub release 3.4.81](https://github.com/tutivsoft-com/tool-app-Obsidian-Meridian-Timeline/releases/tag/3.4.81).

## Support

Use **Open Help** in plugin settings or **Open documentation** in the command palette. Use **Copy diagnostic log** to collect local troubleshooting details and review them before sharing. For a billing problem, keep the original purchase or operation ID and sign in to the [Constance account portal](https://app.tutivsoft.com) with the original account. Do not share passwords or session tokens.
