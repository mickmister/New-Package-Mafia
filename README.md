# New Package Mafia

Find newly created packages with more than one published version, and report
them to Mattermost. The combined report includes npm followed by Rust.

## Weekly GitHub Actions report

`.github/workflows/weekly-report.yml` runs every **Monday at 11:00 AM EST (16:00 UTC)** on the
repository's default branch. GitHub may delay scheduled runs. The schedule uses
fixed EST (UTC-5) year-round, which is noon EDT during daylight saving time.
Each run checks tests and types, scans the preceding seven days, and generates CSV and Markdown
reports. The limits are 30 results **per provider**, 300 pages, and a 30-minute
job timeout, matching the previous combined report's scan settings.

Reports are available in the Actions job summary and as downloadable artifacts
for 30 days, including on dry runs. A week with no matches still produces a
report. Normal runs also publish to Mattermost; a missing publishing secret
fails the job instead of silently skipping publication.

### Required repository secret

In **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
| --- | --- |
| `MATTERMOST_WEBHOOK_URL` | The full Mattermost incoming webhook URL for the target channel. |

No npm, crates.io, AI, or personal GitHub token is needed. Artifact uploads use
GitHub's automatically supplied Actions credentials. No GitHub Environment needs
to be created; this workflow uses repository secrets.

### Manual dry run (no secrets required)

Open **Actions → Weekly package report → Run workflow**, select the default
branch, and leave **dry_run** checked (the default). This performs the same live
registry scan, bounded Rust archive inspection, report rendering, tests, type
checks, and artifact upload, but never posts to Mattermost—even if a webhook
secret already exists. It does not simulate the authenticated publishing call.

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
`MATTERMOST_WEBHOOK_URL` to publish locally. Run `pnpm start --help` for other
filters and interactive usage.
