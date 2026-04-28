// Experiment 040 - feature report command.
//
// Product-facing report smoke: summarize feature state, gates, sessions, token
// use, artifacts, and the latest quality block from ordinary project files.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const SHOSHIN_CLI = resolve(HARNESS_ROOT, "src", "cli.ts");
const FIXTURE = resolve(__dirname, "fixture");

rmSync(FIXTURE, { recursive: true, force: true });
mkdirSync(resolve(FIXTURE, ".shoshin"), { recursive: true });
mkdirSync(resolve(FIXTURE, "app"), { recursive: true });
writeFileSync(resolve(FIXTURE, "app", "index.html"), "<!doctype html><html></html>", "utf8");
writeFileSync(
  resolve(FIXTURE, ".shoshin", "features.json"),
  JSON.stringify(
    {
      version: 1,
      features: [
        {
          id: "practice-planner",
          name: "practice planner",
          description: "",
          state: "SCAFFOLDED",
          scopePath: "app/",
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:01:00.000Z",
          history: [],
        },
      ],
    },
    null,
    2,
  ),
  "utf8",
);
const trail = [
  { ts: "2026-04-28T00:00:01.000Z", kind: "session_summary", role: "builder", piSessionId: "s1", sessionFile: "s1.jsonl", durationMs: 10, tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15 }, cost: 0 },
  { ts: "2026-04-28T00:00:02.000Z", kind: "repair_attempt", feature: "practice-planner", role: "builder", attempt: 1, maxAttempts: 2, reason: "Gate: html_behavior_gate" },
  { ts: "2026-04-28T00:00:03.000Z", kind: "mutation_gate", feature: "practice-planner", status: "passed", root: "app", changedFiles: ["index.html"], reason: null },
  { ts: "2026-04-28T00:00:04.000Z", kind: "browser_check", feature: "practice-planner", status: "failed", engine: "playwright", task: "deterministic HTML behavior gate", durationMs: 20, reason: "behavior gate exited with code 1", outputDigest: "AssertionError" },
  { ts: "2026-04-28T00:00:05.000Z", kind: "process_hygiene", action: "tool_echo_synthesis", pid: 123, command: "builder", durationMs: 30, reason: "tool echo" },
  { ts: "2026-04-28T00:00:06.000Z", kind: "quality_block", feature: "practice-planner", gate: "html_behavior_gate", reason: "behavior gate exited with code 1", changedFiles: ["index.html"], repairAttempts: 1, nextAction: "Patch event path." },
];
writeFileSync(resolve(FIXTURE, ".shoshin", "trail.jsonl"), trail.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");

const result = spawnSync(process.execPath, [TSX_BIN, SHOSHIN_CLI, "report", "practice-planner"], {
  cwd: FIXTURE,
  encoding: "utf8",
  timeout: 120_000,
});
assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
for (const needle of [
  "practice planner (practice-planner)",
  "State: SCAFFOLDED",
  "Repairs: 1",
  "Tokens: 15",
  "Final answer cleanups: 1",
  "browser: failed",
  "app/index.html",
  "Latest Blocked Result",
  "Patch event path.",
]) {
  assert.match(result.stdout, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), result.stdout);
}

const htmlResult = spawnSync(process.execPath, [TSX_BIN, SHOSHIN_CLI, "report", "practice-planner", "--html"], {
  cwd: FIXTURE,
  encoding: "utf8",
  timeout: 120_000,
});
assert.equal(htmlResult.status, 0, `${htmlResult.stderr}\n${htmlResult.stdout}`);
const htmlPath = resolve(FIXTURE, ".shoshin", "reports", "practice-planner.html");
assert.ok(existsSync(htmlPath), `missing ${htmlPath}`);
const html = readFileSync(htmlPath, "utf8");
for (const needle of [
  "<!doctype html>",
  "Run Summary",
  "Gates",
  "Artifacts",
  "Latest Blocked Result",
  "Final answer cleanups",
  "app/index.html",
  "Patch event path.",
]) {
  assert.match(html, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), html);
}

console.log("040 feature report smoke passed");
