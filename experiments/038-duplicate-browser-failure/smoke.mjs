// Experiment 038 - duplicate browser failure suppression.
//
// Browser repairs should spend turns on convergence, not repeated failures with
// no scoped artifact movement. This locks the repair-budget economics guard.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "duplicate_browser_failure_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { browserFailureSignature, shouldContinueBrowserRepair } from "../../packages/shoshin-harness/src/orchestrator/loop.js";',
    'const first = shouldContinueBrowserRepair({ attempt: 0, repairBudget: 2, behaviorProgress: false, repeatedFailureCount: 1, role: "builder" });',
    'if (!first.ok) throw new Error(`first browser repair should be allowed: ${JSON.stringify(first)}`);',
    'const progressed = shouldContinueBrowserRepair({ attempt: 1, repairBudget: 2, behaviorProgress: true, repeatedFailureCount: 2, role: "builder" });',
    'if (!progressed.ok) throw new Error(`progressing browser repair should be allowed: ${JSON.stringify(progressed)}`);',
    'const duplicate = shouldContinueBrowserRepair({ attempt: 1, repairBudget: 2, behaviorProgress: false, repeatedFailureCount: 2, role: "builder" });',
    'if (duplicate.ok || !duplicate.reason?.includes("without scoped artifact changes")) throw new Error(JSON.stringify(duplicate));',
    'const repeated = shouldContinueBrowserRepair({ attempt: 1, repairBudget: 2, behaviorProgress: true, repeatedFailureCount: 3, role: "builder" });',
    'if (repeated.ok || !repeated.reason?.includes("same browser-gate failure repeated")) throw new Error(JSON.stringify(repeated));',
    'const exhausted = shouldContinueBrowserRepair({ attempt: 2, repairBudget: 2, behaviorProgress: true, repeatedFailureCount: 1, role: "builder" });',
    'if (exhausted.ok) throw new Error(`exhausted budget should stop: ${JSON.stringify(exhausted)}`);',
    'const nonBuilder = shouldContinueBrowserRepair({ attempt: 0, repairBudget: 2, behaviorProgress: true, repeatedFailureCount: 1, role: "qa" });',
    'if (nonBuilder.ok) throw new Error(`non-builder should not repair browser gate: ${JSON.stringify(nonBuilder)}`);',
    'const signature = browserFailureSignature({ ok: false, status: "failed", root: "x", targetFile: "x/index.html", durationMs: 1, reason: "behavior gate exited with code 1", output: "Traceback\\nAssertionError: submitted session is not visible" });',
    'if (signature !== "assertion:submitted session is not visible") throw new Error(signature);',
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

console.log("038 duplicate browser failure smoke passed");
