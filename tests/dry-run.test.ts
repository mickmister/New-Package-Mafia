import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseCliArgs } from "../src/cli-args.js";

test("dry run renders reports without calling a configured webhook", async () => {
  assert.equal(parseCliArgs(["--dry-run"]).dryRun, true);
  const directory = await mkdtemp(join(tmpdir(), "package-report-test-"));
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.end("ok");
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const input = join(directory, "input.csv");
    await writeFile(input, [
      "Ecosystem,Name,Version,Description,Published,Versions,Bin,URL",
      "rust,zeta,1.0.1,Desktop app,2026-10-12,2,gpui,https://crates.io/crates/zeta",
      "npm,alpha,1.0.1,CLI tool,2026-10-12,2,cli,https://www.npmjs.com/package/alpha",
    ].join("\n"));
    const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
    const tsx = createRequire(import.meta.url).resolve("tsx");
    const { stdout } = await promisify(execFile)(process.execPath,
      ["--import", tsx, entry, "--csv", input, "--dry-run"], {
        cwd: directory,
        env: { ...process.env, MATTERMOST_WEBHOOK_URL: `http://127.0.0.1:${address.port}` },
        timeout: 30000,
      });
    assert.match(stdout, /Dry run/);
    assert.equal(requests, 0);
    const files = await readdir(join(directory, "out"));
    assert.equal(files.filter(file => file.endsWith(".csv")).length, 1);
    const markdown = files.find(file => file.endsWith(".md"));
    assert.ok(markdown);
    const report = await readFile(join(directory, "out", markdown), "utf-8");
    assert.match(report, /## New Packages/);
    assert.match(report, /\| gpui \|/);
    assert.ok(report.indexOf("[alpha]") < report.indexOf("[zeta]"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
