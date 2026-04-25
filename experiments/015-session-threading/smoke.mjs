// Experiment 015 - Pi session threading through Shoshin dispatch.
//
// Offline checks verify the session key store. With SARVAM_API_KEY set, this
// runs two Scout dispatches and asserts that the same Pi session is persisted.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const SARVAM_PI_ROOT = resolve(__dirname, "..", "..");
const FIXTURE = resolve(__dirname, "fixture");
const SHOSHIN_BIN = resolve(HARNESS_ROOT, "bin", "shoshin.js");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");

function nodeShoshin(args, opts = {}) {
  return spawnSync(process.execPath, [SHOSHIN_BIN, ...args], {
    cwd: opts.cwd ?? FIXTURE,
    encoding: "utf8",
    env: { ...process.env, SARVAM_PI_ROOT },
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 240_000,
  });
}

function step(label, fn) {
  process.stdout.write(`\n> ${label}\n`);
  const out = fn();
  if (out !== undefined) process.stdout.write(out + "\n");
}

function fail(msg) {
  console.error(`x ${msg}`);
  process.exit(1);
}

step("Reset fixture", () => {
  rmSync(FIXTURE, { recursive: true, force: true });
  mkdirSync(FIXTURE, { recursive: true });
});

step("Offline: session-store writes and reads .id files", () => {
  const driver = resolve(__dirname, "session_store_test.ts");
  writeFileSync(
    driver,
    [
      'import { readStoredSessionId, writeStoredSessionId } from "../../packages/shoshin-harness/src/orchestrator/session-store.js";',
      `const cwd = ${JSON.stringify(FIXTURE)};`,
      'const path = writeStoredSessionId(cwd, "feature-one-scout", "abc123");',
      'const readBack = readStoredSessionId(cwd, "feature-one-scout");',
      'if (readBack !== "abc123") throw new Error(`bad readback: ${readBack}`);',
      'console.log(path);',
    ].join("\n"),
    "utf8",
  );
  const r = spawnSync(process.execPath, [TSX_BIN, driver], {
    encoding: "utf8",
    env: { ...process.env, SARVAM_PI_ROOT },
    timeout: 30_000,
  });
  rmSync(driver, { force: true });
  if (r.status !== 0) fail(`session-store driver failed:\n${r.stderr}\n${r.stdout}`);
  const idPath = resolve(FIXTURE, ".shoshin", "sessions", "feature-one-scout.id");
  if (!existsSync(idPath)) fail("session .id file missing");
  return `  wrote ${idPath}`;
});

step("shoshin init + feature", () => {
  const init = nodeShoshin(["init", "session-threading-smoke"]);
  if (init.status !== 0) fail(`init failed: ${init.stderr}`);
  const add = nodeShoshin(["features", "add", "thread-check", "--scope", "internal/thread/"]);
  if (add.status !== 0) fail(`feature add failed: ${add.stderr}`);
  mkdirSync(resolve(FIXTURE, "internal", "thread"), { recursive: true });
});

if (!process.env.SARVAM_API_KEY) {
  console.warn("\n(skipping live dispatch threading - set SARVAM_API_KEY to enable)");
  console.log("\nSESSION THREADING SMOKE: PASSED (offline)\n");
  process.exit(0);
}

step("Live: first Scout dispatch creates a Pi session", () => {
  const r = nodeShoshin([
    "dispatch",
    "scout",
    "thread-check",
    "--brief",
    "Read the project lightly and reply with the marker FIRST_SESSION_TURN plus one sentence.",
    "--timeout-sec",
    "180",
  ], { timeout: 240_000 });
  if (r.status !== 0) fail(`first dispatch failed:\n${r.stderr}\n${r.stdout.slice(-2000)}`);
  const idPath = resolve(FIXTURE, ".shoshin", "sessions", "feature-thread-check-scout.id");
  if (!existsSync(idPath)) fail("feature scout session id missing after first dispatch");
  const id = readFileSync(idPath, "utf8").trim();
  if (!id) fail("feature scout session id file empty");
  return `  session id ${id}`;
});

step("Live: second Scout dispatch reuses the persisted session", () => {
  const before = readFileSync(
    resolve(FIXTURE, ".shoshin", "sessions", "feature-thread-check-scout.id"),
    "utf8",
  ).trim();
  const r = nodeShoshin([
    "dispatch",
    "scout",
    "thread-check",
    "--brief",
    "This is the second turn. Reply with SECOND_SESSION_TURN and mention whether session history is available.",
    "--timeout-sec",
    "180",
  ], { timeout: 240_000 });
  if (r.status !== 0) fail(`second dispatch failed:\n${r.stderr}\n${r.stdout.slice(-2000)}`);
  const after = readFileSync(
    resolve(FIXTURE, ".shoshin", "sessions", "feature-thread-check-scout.id"),
    "utf8",
  ).trim();
  if (before !== after) fail(`session id changed across turns: ${before} -> ${after}`);
  return `  reused session id ${after}`;
});

step("Verify trail telemetry and Pi JSONL", () => {
  const trailPath = resolve(FIXTURE, ".shoshin", "trail.jsonl");
  const trail = readFileSync(trailPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const summaries = trail.filter((r) => r.kind === "session_summary");
  if (summaries.length < 2) fail(`expected >=2 session_summary records, got ${summaries.length}`);
  const last = summaries.at(-1);
  if (!last.piSessionId) fail("session_summary missing piSessionId");
  if (!last.sessionFile || !existsSync(last.sessionFile)) {
    fail(`session_summary sessionFile missing or absent on disk: ${last.sessionFile}`);
  }
  const jsonl = readFileSync(last.sessionFile, "utf8").split("\n").filter(Boolean);
  if (jsonl.length < 4) fail(`Pi session JSONL too short: ${jsonl.length} lines`);
  const homeSessionRoot = resolve(os.homedir(), ".pi", "agent", "sessions");
  if (!last.sessionFile.startsWith(homeSessionRoot)) {
    fail(`Pi session file outside expected session root: ${last.sessionFile}`);
  }
  return `  ${summaries.length} summaries; Pi JSONL ${jsonl.length} lines`;
});

console.log("\nSESSION THREADING SMOKE: PASSED\n");
