// Experiment 039 - quality block diagnostics.
//
// Blocked runs should leave a concise, user-readable summary: gate, reason,
// changed files, repair count, and next action.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "quality_block_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { qualityBlockFromDispatchFailure, qualityBlockFromGates } from "../../packages/shoshin-harness/src/orchestrator/loop.js";',
    'const mutationGate = { ok: true, root: "app", changedFiles: ["index.html"] };',
    'const browser = qualityBlockFromGates("planner", 3, { mutationGate, htmlBehaviorGate: { ok: false, status: "failed", root: "app", targetFile: "app/index.html", durationMs: 1, reason: "behavior gate exited with code 1", output: "AssertionError: submitted session is not visible" } });',
    'if (browser.gate !== "html_behavior_gate") throw new Error(JSON.stringify(browser));',
    'if (!browser.changedFiles.includes("index.html")) throw new Error(JSON.stringify(browser));',
    'if (!browser.nextAction.includes("event/state/render/persistence")) throw new Error(JSON.stringify(browser));',
    'const html = qualityBlockFromGates("planner", 1, { mutationGate, htmlStaticGate: { ok: false, status: "failed", root: "app", filesChecked: 1, issues: [{ file: "index.html", code: "unsafe-inner-html", message: "escape user input" }] } });',
    'if (html.gate !== "html_static_gate" || !html.reason.includes("escape user input")) throw new Error(JSON.stringify(html));',
    'const compile = qualityBlockFromGates("api", 2, { mutationGate, compileGate: { ok: false, language: "go", status: "failed", command: "go test ./...", cwd: ".", durationMs: 1, reason: "syntax error", stdout: "", stderr: "" } });',
    'if (compile.gate !== "compile_gate" || !compile.nextAction.includes("compile command")) throw new Error(JSON.stringify(compile));',
    'const mutation = qualityBlockFromGates("api", 2, { mutationGate: { ok: false, root: "pkg", changedFiles: [], reason: "no scoped mutation detected" } });',
    'if (mutation.gate !== "mutation_gate" || !mutation.nextAction.includes("inside the feature scope")) throw new Error(JSON.stringify(mutation));',
    'const finalAnswer = qualityBlockFromGates("api", 0, { mutationGate, finalAnswerReason: "MODEL_DONE advancement blocked: final answer was too thin to serve as evidence" });',
    'if (finalAnswer.gate !== "final_answer" || !finalAnswer.reason.includes("too thin")) throw new Error(JSON.stringify(finalAnswer));',
    'const process = qualityBlockFromDispatchFailure("app", { ok: false, output: "", durationMs: 1, exitCode: 1, error: "exit 1: Blocked bash command \\"pwd && ls -la\\"" }, 2, []);',
    'if (process.gate !== "process_hygiene" || !process.nextAction.includes("avoids shell discovery")) throw new Error(JSON.stringify(process));',
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

console.log("039 quality block diagnostics smoke passed");
