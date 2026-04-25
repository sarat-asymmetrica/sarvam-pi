// Experiment 021 - browser-use capability layer.
//
// Offline-friendly smoke: browser-use is optional. The harness must record a
// browser_check trail event whether the local Python env can run it or skips it.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const FIXTURE = resolve(__dirname, "fixture");

function fail(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

function step(label, fn) {
  process.stdout.write(`\n> ${label}\n`);
  const out = fn();
  if (out !== undefined) process.stdout.write(`${out}\n`);
}

step("Reset fixture", () => {
  rmSync(FIXTURE, { recursive: true, force: true });
  mkdirSync(resolve(FIXTURE, ".shoshin"), { recursive: true });
});

step("Run browser-use adapter", () => {
  const driver = resolve(__dirname, "browser_use_cap_test.ts");
  writeFileSync(
    driver,
    [
      'import { runBrowserUseCheck } from "../../packages/shoshin-harness/src/browser/browser-use.js";',
      `const cwd = ${JSON.stringify(FIXTURE)};`,
      'const result = runBrowserUseCheck({ cwd, feature: "browser-use-cap", task: "Open about:blank and report that the browser is reachable.", timeoutMs: 60_000 });',
      'if (!["passed", "failed", "skipped"].includes(result.status)) throw new Error(`bad status ${result.status}`);',
      'if (result.status === "failed") throw new Error(`browser-use present but task failed: ${result.error}\\n${result.output}`);',
      'console.log(JSON.stringify({ status: result.status, durationMs: result.durationMs, error: result.error ?? null }, null, 2));',
    ].join("\n"),
    "utf8",
  );
  const r = spawnSync(process.execPath, [TSX_BIN, driver], {
    cwd: FIXTURE,
    encoding: "utf8",
    timeout: 90_000,
  });
  rmSync(driver, { force: true });
  if (r.status !== 0) fail(`browser-use adapter driver failed:\n${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
});

step("Verify browser_check trail", () => {
  const trailPath = resolve(FIXTURE, ".shoshin", "trail.jsonl");
  const records = readFileSync(trailPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const browserChecks = records.filter((record) => record.kind === "browser_check");
  if (browserChecks.length !== 1) fail(`expected exactly one browser_check, got ${browserChecks.length}`);
  const check = browserChecks[0];
  if (check.engine !== "browser-use") fail(`wrong engine: ${check.engine}`);
  return `  ${check.status}: ${check.reason ?? check.outputDigest ?? ""}`;
});

console.log("\nBROWSER-USE CAPABILITY SMOKE: PASSED\n");
