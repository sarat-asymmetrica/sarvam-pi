// Experiment 041 - plain product language.
//
// The public CLI should describe the product in calm user-facing terms while
// keeping internal architecture language inside internals and docs.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const SHOSHIN_CLI = resolve(HARNESS_ROOT, "src", "cli.ts");

const result = spawnSync(process.execPath, [TSX_BIN, SHOSHIN_CLI, "--help"], {
  cwd: resolve(__dirname, "..", ".."),
  encoding: "utf8",
  timeout: 120_000,
});
assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);

for (const needle of [
  "a local coding assistant",
  "Start a project workspace",
  "Create or import the project brief",
  "Manage tasks",
  "Inspect the activity log",
  "Ask one worker role",
]) {
  assert.match(result.stdout, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), result.stdout);
}

for (const banned of ["vibe-coder", "stigmergy", "persona pairs", "subagent"]) {
  assert.doesNotMatch(result.stdout, new RegExp(banned, "i"), result.stdout);
}

console.log("041 plain product language smoke passed");
