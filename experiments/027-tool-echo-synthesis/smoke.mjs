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
    'import { isToolCallEcho } from "../../packages/shoshin-harness/src/orchestrator/dispatch.js";',
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

console.log("027 tool-echo synthesis smoke passed");
