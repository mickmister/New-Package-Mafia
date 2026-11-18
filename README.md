# New Package Mafia

Find newly created packages with more than one published version, and report
them to Discord and/or Mattermost. The combined report includes npm followed by Rust.

## Weekly GitHub Actions report

`.github/workflows/weekly-report.yml` runs every **Monday at 11:00 AM EST (16:00 UTC)** on the
repository's default branch. GitHub may delay scheduled runs. The schedule uses
fixed EST (UTC-5) year-round, which is noon EDT during daylight saving time.
Each run checks tests and types, scans the preceding seven days, and generates CSV and Markdown
reports. The limits are 30 results **per provider**, 300 pages, and a 30-minute
job timeout, matching the previous combined report's scan settings.

Reports are available in the Actions job summary and as downloadable artifacts
for 30 days, including on dry runs. A week with no matches still produces a
report. Normal runs publish to every configured destination. If neither webhook
is configured, publishing fails instead of silently skipping publication. Both
destinations are attempted even if one fails; any failed destination fails the job.

### Repository webhook secrets

In **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | The full Discord incoming webhook URL for the target text channel. |
| `MATTERMOST_WEBHOOK_URL` | The full Mattermost incoming webhook URL for the target channel. |

Set either secret to publish there, or both to send to both. For Discord-only
publishing, add `DISCORD_WEBHOOK_URL` and remove `MATTERMOST_WEBHOOK_URL`.

### Create the podcast Discord server

1. In Discord, click **+ → Create My Own**, choose the community option, and give
   the podcast server its name (for example, **New Package Mafia**).
2. Create a regular text channel named **#weekly-packages** for automated reports.
   Suggested companion channels: **#podcast**, **#episode-ideas**, and **#general**.
3. Open **Edit Channel → Integrations → Webhooks → New Webhook**. Name it
   **Package Tracker**, select **#weekly-packages**, save, and copy the webhook URL.
4. Add that URL as the fork's `DISCORD_WEBHOOK_URL` Actions repository secret.
5. Run the workflow with `dry_run=false` when ready to publish.

No Discord bot or bot token is needed. Discord reports use package lists rather
than tables, are split into messages of at most 2,000 characters, and preserve
npm-before-Rust ordering. The publisher waits for delivery confirmation and retries
rate-limit responses up to three times (at most 120 seconds per retry).
Package text cannot trigger Discord mentions. A partial delivery can occur if
a later message fails; rerunning a publishing job reposts the report.

No npm, crates.io, AI, or personal GitHub token is needed. Artifact uploads use
GitHub's automatically supplied Actions credentials. No GitHub Environment needs
to be created; this workflow uses repository secrets.

### Manual dry run (no secrets required)

Open **Actions → Weekly package report → Run workflow**, select the default
branch, and leave **dry_run** checked (the default). This performs the same live
registry scan, bounded Rust archive inspection, report rendering, tests, type
checks, and artifact upload, but never posts to Discord or Mattermost—even if webhook
secrets already exist. It does not simulate the authenticated publishing calls.
The artifacts include a `*.discord.md` preview with separators between messages.

For the current fork:

```bash
gh workflow run weekly-report.yml --repo mickmister/New-Package-Mafia \
  --ref vk/8508-npm-other-packag -f dry_run=true
```

After adding the secret, uncheck **dry_run** (or pass `-f dry_run=false`) to
publish manually. Scheduled Monday runs publish automatically.

### Local usage

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm check-types
pnpm exec tsx src/index.ts --provider all --range 7d --max-results 30 \
  --changes-limit 10000 --max-pages 300 --dry-run
```

CSV and Markdown files are written to `out/`. Omit `--dry-run` and set
`DISCORD_WEBHOOK_URL` and/or `MATTERMOST_WEBHOOK_URL` to publish locally. Run `pnpm start --help` for other
filters and interactive usage.
