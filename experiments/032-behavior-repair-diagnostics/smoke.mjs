import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "behavior_repair_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { htmlBehaviorGateFailureReport } from "../../packages/shoshin-harness/src/orchestrator/loop.js";',
    'import { browserRepairBrief } from "../../packages/shoshin-harness/src/orchestrator/loop.js";',
    'const report = htmlBehaviorGateFailureReport({',
    '  ok: false,',
    '  status: "failed",',
    '  root: "C:/tmp/app",',
    '  targetFile: "C:/tmp/app/index.html",',
    '  durationMs: 123,',
    '  reason: "behavior gate exited with code 1",',
    '  output: "AssertionError: submitted session is not visible",',
    '});',
    'for (const needle of ["Repair diagnostics:", "submit listener", "event.preventDefault", "bind it or wrap it", "render function"]) {',
    '  if (!report.includes(needle)) throw new Error(`missing diagnostic: ${needle}\\n${report}`);',
    '}',
    'const selectorReport = htmlBehaviorGateFailureReport({',
    '  ok: false, status: "failed", root: "x", targetFile: "x/index.html", durationMs: 1,',
    '  reason: "behavior gate exited with code 1",',
    '  output: "AssertionError: Missing selector: #unitPrice | [name=\'unitPrice\']",',
    '});',
    'if (!selectorReport.includes("stable ids/names")) throw new Error(selectorReport);',
    'const repairBrief = browserRepairBrief("Original task", report, 2, "app/");',
    'for (const needle of ["Browser repair attempt 2", "Read the current HTML file first (app/index.html)", "control selector -> event listener -> state update -> render call -> localStorage", "State the most likely failing line", "Do not redesign the UI"]) {',
    '  if (!repairBrief.includes(needle)) throw new Error(`missing browser repair protocol: ${needle}\\n${repairBrief}`);',
    '}',
  ].join("\n"),
  "utf8",
);

const result = spawnSync(process.execPath, [TSX_BIN, DRIVER], {
  cwd: resolve(__dirname, "..", ".."),
  encoding: "utf8",
  timeout: 30_000,
});
rmSync(DRIVER, { force: true });
assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);

console.log("032 behavior repair diagnostics smoke passed");
