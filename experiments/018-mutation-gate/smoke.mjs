// Experiment 018 - Builder mutation gate.
//
// Offline smoke for the bug found by dogfooding: a Builder dispatch must not
// advance to MODEL_DONE when it reports success without changing scoped files.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
  mkdirSync(resolve(FIXTURE, "app"), { recursive: true });
});

step("Run mutation gate driver", () => {
  const driver = resolve(__dirname, "mutation_gate_test.ts");
  writeFileSync(
    driver,
    [
      'import { writeFileSync } from "node:fs";',
      'import { resolve } from "node:path";',
      'import { snapshotScope, compareMutationSnapshot } from "../../packages/shoshin-harness/src/orchestrator/mutation-gate.js";',
      `const cwd = ${JSON.stringify(FIXTURE)};`,
      'const before = snapshotScope(cwd, "app");',
      'const unchanged = compareMutationSnapshot(before);',
      'if (unchanged.ok) throw new Error(`expected unchanged scope to fail: ${JSON.stringify(unchanged)}`);',
      'writeFileSync(resolve(cwd, "app", "index.html"), "<!doctype html><html></html>", "utf8");',
      'const changed = compareMutationSnapshot(before);',
      'if (!changed.ok || !changed.changedFiles.includes("index.html")) throw new Error(`expected changed scope to pass: ${JSON.stringify(changed)}`);',
      'console.log(JSON.stringify({ unchanged: unchanged.reason, changed: changed.changedFiles }, null, 2));',
    ].join("\n"),
    "utf8",
  );
  const r = spawnSync(process.execPath, [TSX_BIN, driver], {
    encoding: "utf8",
    timeout: 30_000,
  });
  rmSync(driver, { force: true });
  if (r.status !== 0) fail(`mutation gate driver failed:\n${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
});

console.log("\nMUTATION GATE SMOKE: PASSED\n");
