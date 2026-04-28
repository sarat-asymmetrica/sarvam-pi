// Experiment 037 - finalization evidence hardening.
//
// A successful child process is not enough to advance a feature: the final
// answer must be real evidence, not a tool echo or a thin status word.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "finalization_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { dispatchEvidenceForAdvance } from "../../packages/shoshin-harness/src/orchestrator/loop.js";',
    'const base = { ok: true, durationMs: 1, exitCode: 0, output: "" };',
    'const echo = dispatchEvidenceForAdvance({ ...base, output: "Called tool write with arguments {\\"path\\":\\"app/index.html\\"}." }, "MODEL_DONE");',
    'if (echo.ok || !echo.reason.includes("tool-call echo")) throw new Error(JSON.stringify(echo));',
    'const weak = dispatchEvidenceForAdvance({ ...base, output: "Done." }, "MODEL_DONE");',
    'if (weak.ok || !weak.reason.includes("too thin")) throw new Error(JSON.stringify(weak));',
    'const strong = dispatchEvidenceForAdvance({ ...base, output: "Changed files: app/index.html\\nVerification: static gate and browser gate passed\\nNotes: none" }, "MODEL_DONE");',
    'if (!strong.ok) throw new Error(JSON.stringify(strong));',
    'if (strong.text.length > 200) throw new Error(`evidence too long: ${strong.text.length}`);',
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

console.log("037 finalization evidence smoke passed");
