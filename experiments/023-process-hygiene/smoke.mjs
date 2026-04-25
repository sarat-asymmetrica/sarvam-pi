// Experiment 023 - process hygiene for timed-out dispatches.
//
// Offline smoke: launch a long-lived Python HTTP server through the dispatch
// timeout path, then prove the process tree is killed and the fixture unlocks.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  mkdirSync(resolve(FIXTURE, "site"), { recursive: true });
  writeFileSync(resolve(FIXTURE, "site", "index.html"), "<!doctype html><p>ok</p>", "utf8");
});

step("Run timed-out server dispatch", () => {
  const driver = resolve(__dirname, "process_hygiene_test.ts");
  writeFileSync(
    driver,
    [
      'import { dispatchProcessForTest } from "../../packages/shoshin-harness/src/orchestrator/dispatch.js";',
      `const cwd = ${JSON.stringify(FIXTURE)};`,
      '(async () => {',
      '  const result = await dispatchProcessForTest({ command: "python", args: ["-m", "http.server", "8765", "--directory", "site"], cwd, timeoutMs: 1500 });',
      '  if (result.ok || !result.error?.includes("timed out")) throw new Error(`expected timeout, got ${JSON.stringify(result)}`);',
      '  console.log(JSON.stringify({ ok: result.ok, error: result.error, durationMs: result.durationMs }, null, 2));',
      '})().catch((err) => { console.error(err); process.exit(1); });',
    ].join("\n"),
    "utf8",
  );
  const r = spawnSync(process.execPath, [TSX_BIN, driver], {
    cwd: FIXTURE,
    encoding: "utf8",
    timeout: 30_000,
  });
  rmSync(driver, { force: true });
  if (r.status !== 0) fail(`process hygiene driver failed:\n${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
});

step("Verify port is closed and trail recorded hygiene", () => {
  const probe = spawnSync("python", ["-c", [
    "import socket, sys",
    "s=socket.socket()",
    "s.settimeout(1)",
    "try:",
    "    s.connect(('127.0.0.1', 8765))",
    "    sys.exit(1)",
    "except Exception:",
    "    sys.exit(0)",
  ].join("\n")], {
    encoding: "utf8",
    timeout: 5_000,
  });
  if (probe.status !== 0) fail("port 8765 is still accepting connections");
  const trail = readFileSync(resolve(FIXTURE, ".shoshin", "trail.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const hygiene = trail.filter((record) => record.kind === "process_hygiene");
  if (hygiene.length !== 1) fail(`expected one process_hygiene record, got ${hygiene.length}`);
  return `  ${hygiene[0].action}: ${hygiene[0].reason}`;
});

step("Verify fixture can be removed", () => {
  rmSync(FIXTURE, { recursive: true, force: true });
  return "  fixture removed";
});

console.log("\nPROCESS HYGIENE SMOKE: PASSED\n");
