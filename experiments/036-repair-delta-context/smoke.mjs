// Experiment 036 - repair delta context.
//
// Same-session repair prompts should include a tiny scoped file delta from the
// previous attempt, so the next turn can converge from actual artifact changes.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "repair_delta_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { browserRepairBrief, repairBrief, scopedAttemptChangeSummary } from "../../packages/shoshin-harness/src/orchestrator/loop.js";',
    'const before = { root: "C:/tmp/app", files: { "index.html": "old", "old.css": "gone", "same.js": "same" } };',
    'const after = { root: "C:/tmp/app", files: { "index.html": "new", "app.js": "added", "same.js": "same" } };',
    'const delta = scopedAttemptChangeSummary(before, after);',
    'for (const needle of ["Added: app.js", "Modified: index.html", "Deleted: old.css"]) {',
    '  if (!delta.includes(needle)) throw new Error(`missing delta ${needle}:\\n${delta}`);',
    '}',
    'const unchanged = scopedAttemptChangeSummary(after, after);',
    'if (!unchanged.includes("No scoped file changes")) throw new Error(unchanged);',
    'const baseline = scopedAttemptChangeSummary(null, after);',
    'if (!baseline.includes("Baseline snapshot captured") || !baseline.includes("index.html")) throw new Error(baseline);',
    'const generic = repairBrief("Build app", "Gate: html_static_gate", 2, delta);',
    'const browser = browserRepairBrief("Build app", "Gate: html_behavior_gate", 3, "app/", delta);',
    'for (const text of [generic, browser]) {',
    '  if (!text.includes("Scoped artifact changes from the previous attempt")) throw new Error(text);',
    '  if (!text.includes("Added: app.js")) throw new Error(text);',
    '  if (!text.includes("Modified: index.html")) throw new Error(text);',
    '  if (!text.includes("Deleted: old.css")) throw new Error(text);',
    '}',
    'if (!browser.includes("Read the current HTML file first (app/index.html)")) throw new Error(browser);',
  ].join("\n"),
  "utf8",
);

const result = spawnSync(process.execPath, [TSX_BIN, DRIVER], {
  cwd: resolve(__dirname, "..", ".."),
  encoding: "utf8",
  timeout: 120_000,
});
rmSync(DRIVER, { force: true });
assert.equal(
  result.status,
  0,
  `status=${result.status} signal=${result.signal} error=${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`,
);

console.log("036 repair delta context smoke passed");
