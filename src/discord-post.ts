import { setTimeout as delay } from "node:timers/promises";
import type { PackageInfo } from "./package-types.js";
import { sortPackagesForReport } from "./mattermost-post.js";

function escapeMarkdown(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[\\`*_{}\[\]()<>~|]/g, "\\$&");
}

/** Discord supports lists, but not the Markdown tables used by Mattermost. */
export function renderDiscordMessages(packages: PackageInfo[]): string[] {
  const title = `## New Packages (${new Date().toISOString().split("T")[0]})`;
  const blocks = [title];
  for (const pkg of sortPackagesForReport(packages)) {
    const signals = (pkg.binSignals ?? (pkg.hasBin ? ["cli"] : [])).join(", ") || "—";
    blocks.push([
      `**${pkg.ecosystem} · ${escapeMarkdown(pkg.name)}** — ${escapeMarkdown(pkg.version)}`,
      escapeMarkdown((pkg.description || "No description").slice(0, 300)),
      `Published: ${pkg.publishedAt.toISOString().split("T")[0]} · Versions: ${pkg.numberOfVersions} · Bin: ${escapeMarkdown(signals)}`,
      ...(pkg.jsLines === undefined ? [] : [`JS lines: ${pkg.jsLines}`]),
      ...(pkg.aiSummary ? [`Summary: ${escapeMarkdown(pkg.aiSummary.slice(0, 300))}`] : []),
      `<${pkg.npmUrl}>`,
    ].join("\n"));
  }
  if (packages.length === 0) blocks.push("No new packages found.");

  const messages: string[] = [];
  let message = "";
  for (const block of blocks) {
    if (message && message.length + block.length + 2 > 2000) {
      messages.push(message);
      message = "";
    }
    // Normally a package fits in one message; bound even unusually long metadata.
    let remaining = block;
    while (remaining.length > 2000) {
      let end = 2000;
      // Do not split a UTF-16 surrogate pair (e.g. an emoji).
      if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
      messages.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
    message += (message ? "\n\n" : "") + remaining;
  }
  if (message) messages.push(message);
  return messages;
}

export async function postPackagesToDiscord(packages: PackageInfo[], webhookUrl: string): Promise<void> {
  const url = new URL(webhookUrl);
  // Wait for confirmation that each message was actually saved by Discord.
  url.searchParams.set("wait", "true");
  for (const content of renderDiscordMessages(packages)) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, username: "Package Tracker", allowed_mentions: { parse: [] } }),
        signal: AbortSignal.timeout(30000),
      });
      if (response.status === 429 && attempt < 3) {
        const body = await response.json() as { retry_after?: number };
        const seconds = Number(body.retry_after ?? response.headers.get("retry-after") ?? 1);
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120) {
          throw new Error("Discord rate limit retry delay is invalid or exceeds 120 seconds");
        }
        await delay(Math.ceil(seconds * 1000));
        continue;
      }
      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
      }
      await response.arrayBuffer();
      break;
    }
  }
  console.log("Successfully posted to Discord.");
}
