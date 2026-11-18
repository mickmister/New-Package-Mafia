import assert from "node:assert/strict";
import test from "node:test";
import { postPackagesToDiscord, renderDiscordMessages } from "../src/discord-post.js";
import { publishReport } from "../src/publish-report.js";
import type { PackageInfo } from "../src/package-types.js";

function pkg(name: string, ecosystem: PackageInfo["ecosystem"] = "npm"): PackageInfo {
  return {
    name, ecosystem, version: "1.0.1", description: "A package @everyone with *formatting*",
    publishedAt: new Date("2026-11-18T00:00:00Z"), numberOfVersions: 2,
    npmUrl: `https://example.com/${name}`, binSignals: ["cli"], hasBin: true,
  };
}

test("Discord renders all packages within message limits, npm before rust", () => {
  const packages = Array.from({ length: 60 }, (_, i) => pkg(`package-${i}`, i < 30 ? "rust" : "npm"));
  const messages = renderDiscordMessages(packages);
  assert.ok(messages.length > 1);
  assert.ok(messages.every(message => message.length > 0 && message.length <= 2000));
  const report = messages.join("\n");
  assert.ok(report.indexOf("npm ·") < report.indexOf("rust ·"));
  for (const item of packages) assert.ok(report.includes(`<${item.npmUrl}>`));
  assert.match(report, /Published: 2026-11-18 · Versions: 2 · Bin: cli/);
  assert.ok(report.includes("\\*formatting\\*"));
  assert.match(renderDiscordMessages([]).join(""), /No new packages found/);
});

test("Discord bounds unusually long metadata without splitting surrogate pairs", () => {
  const messages = renderDiscordMessages([{ ...pkg("long"), name: "😀".repeat(2500) }]);
  assert.ok(messages.every(message => message.length <= 2000));
  for (const message of messages) {
    assert.doesNotMatch(message, /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
  }
});

test("Discord retries rate limits, waits for confirmation, and suppresses mentions", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: URL | string | Request, init?: RequestInit) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("wait"), "true");
    assert.equal(url.searchParams.get("thread_id"), "123");
    const payload = JSON.parse(String(init?.body));
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.ok(payload.content.length <= 2000);
    return calls === 1
      ? new Response(JSON.stringify({ retry_after: 0 }), { status: 429 })
      : new Response("{}", { status: 200 });
  });
  await postPackagesToDiscord([pkg("demo")], "https://example.com/webhook?thread_id=123");
  assert.equal(calls, 2);
});

test("Discord surfaces publishing failures without including the webhook token", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("private-token", { status: 400 }));
  await assert.rejects(postPackagesToDiscord([], "https://example.com/private-token"), error => {
    assert.match(String(error), /Discord webhook failed: 400/);
    assert.ok(!String(error).includes("private-token"));
    return true;
  });
});

test("publishing supports either destination and sends to both when configured", async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: URL | string | Request) => {
    paths.push(new URL(String(input)).pathname);
    return new Response("{}", { status: 200 });
  });
  await publishReport([], { discord: "https://example.com/discord" });
  assert.deepEqual(paths.splice(0), ["/discord"]);
  await publishReport([], { mattermost: "https://example.com/mattermost" });
  assert.deepEqual(paths.splice(0), ["/mattermost"]);
  await publishReport([], { mattermost: "https://example.com/mattermost", discord: "https://example.com/discord" });
  assert.deepEqual(paths.sort(), ["/discord", "/mattermost"]);
});

test("one failed destination does not prevent delivery to the other", async (t) => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: URL | string | Request) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    return new Response("{}", { status: path === "/mattermost" ? 500 : 200 });
  });
  await assert.rejects(publishReport([], {
    mattermost: "https://example.com/mattermost", discord: "https://example.com/discord",
  }), AggregateError);
  assert.deepEqual(paths.sort(), ["/discord", "/mattermost"]);
});
