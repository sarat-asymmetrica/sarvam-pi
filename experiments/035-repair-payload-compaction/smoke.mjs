// Experiment 035 - repair payload compaction.
//
// Regression smoke for same-session repair turns: repairs should carry bounded
// context because Pi already has the full ticket and prior tool transcript.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "payload_compaction_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { browserRepairBrief, compactPromptText, repairBrief } from "../../packages/shoshin-harness/src/orchestrator/loop.js";',
    'const longTicket = ["Build the requested app.", "A".repeat(12000), "MUST_KEEP_TAIL"].join("\\n");',
    'const longReason = ["Gate: html_behavior_gate", "B".repeat(9000), "TAIL_FAILURE_DETAIL"].join("\\n");',
    'const generic = repairBrief(longTicket, longReason, 2);',
    'const browser = browserRepairBrief(longTicket, longReason, 3, "app/");',
    'if (generic.length > 6800) throw new Error(`generic repair too large: ${generic.length}`);',
    'if (browser.length > 7400) throw new Error(`browser repair too large: ${browser.length}`);',
    'for (const text of [generic, browser]) {',
    '  if (!text.includes("same-session repair turn")) throw new Error(text);',
    '  if (!text.includes("MUST_KEEP_TAIL")) throw new Error("lost ticket tail");',
    '  if (!text.includes("TAIL_FAILURE_DETAIL")) throw new Error("lost reason tail");',
    '  if (!text.includes("chars omitted")) throw new Error("missing compaction marker");',
    '}',
    'if (!browser.includes("Read the current HTML file first (app/index.html)")) throw new Error(browser);',
    'const short = "short prompt";',
    'if (compactPromptText(short, 100) !== short) throw new Error("short prompt should remain unchanged");',
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

console.log("035 repair payload compaction smoke passed");
