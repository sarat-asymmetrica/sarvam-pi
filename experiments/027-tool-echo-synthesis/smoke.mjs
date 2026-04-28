import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "tool_echo_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { isToolCallEcho, isWeakFinalAnswer, synthesisBrief } from "../../packages/shoshin-harness/src/orchestrator/dispatch.js";',
    'const positives = [',
    '  "Called tool write with arguments {\\"path\\":\\"app/index.html\\"}.",',
    '  "Called tool bash with arguments {\\"command\\":\\"npm test\\"}.",',
    '  "Called tool read with arguments {\\"path\\":\\"README.md\\"}",',
    "];",
    'const negatives = [',
    '  "Changed files: app/index.html\\nVerification: not run",',
    '  "I called tool write earlier and then verified the file.",',
    '  "Tool use is complete.",',
    "];",
    "for (const text of positives) {",
    "  if (!isToolCallEcho(text)) throw new Error(`expected echo: ${text}`);",
    "}",
    "for (const text of negatives) {",
    "  if (isToolCallEcho(text)) throw new Error(`expected non-echo: ${text}`);",
    "}",
    'for (const text of ["Done.", "ok", "Implemented"]) {',
    "  if (!isWeakFinalAnswer(text)) throw new Error(`expected weak answer: ${text}`);",
    "}",
    'for (const text of ["Changed files: app/index.html\\nVerification: browser gate passed"]) {',
    "  if (isWeakFinalAnswer(text)) throw new Error(`expected strong answer: ${text}`);",
    "}",
    'const brief = synthesisBrief("Ticket head\\n" + "A".repeat(8000) + "\\nTicket tail", "Called tool write with arguments " + "B".repeat(3000));',
    'if (brief.length > 3800) throw new Error(`synthesis brief too large: ${brief.length}`);',
    'if (!brief.includes("chars omitted")) throw new Error(brief);',
    'if (!brief.includes("final answer must")) throw new Error(brief);',
  ].join("\n"),
  "utf8",
);

const result = spawnSync(process.execPath, [TSX_BIN, DRIVER], {
  cwd: resolve(__dirname, "..", ".."),
  encoding: "utf8",
  timeout: 120_000,
});
rmSync(DRIVER, { force: true });
assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);

console.log("027 tool-echo synthesis smoke passed");
