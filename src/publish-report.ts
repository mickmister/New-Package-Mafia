import type { PackageInfo } from "./package-types.js";
import { postPackagesToDiscord } from "./discord-post.js";
import { postPackagesToMattermost } from "./mattermost-post.js";

export interface ReportDestinations {
  mattermost?: string;
  discord?: string;
}

export async function publishReport(packages: PackageInfo[], destinations: ReportDestinations): Promise<void> {
  // Attempt every configured destination even when another one fails.
  const results = await Promise.allSettled([
    ...(destinations.mattermost ? [postPackagesToMattermost(packages, destinations.mattermost)] : []),
    ...(destinations.discord ? [postPackagesToDiscord(packages, destinations.discord)] : []),
  ]);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length > 0) {
    throw new AggregateError(failures.map(result => result.reason), "Report publishing failed for one or more destinations");
  }
}
