import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "tool_name_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { normalizeToolName } from "../../packages/sarvam-provider/tool-normalization.ts";',
    "const tools = [",
    '  { name: "read" },',
    '  { name: "grep" },',
    '  { name: "find" },',
    '  { name: "ls" },',
    '  { name: "write" },',
    '  { name: "edit" },',
    '  { name: "bash" },',
    "];",
    'const checks = [',
    '  ["Bash", "bash"],',
    '  ["Read", "read"],',
    '  ["bashcap", "bash"],',
    '  ["ReadCap", "read"],',
    '  ["testcap", "bash"],',
    '  ["websearchcap", "websearchcap"],',
    '  ["BashCap", "bash"],',
    "];",
    "for (const [input, expected] of checks) {",
    "  const actual = normalizeToolName(input, tools);",
    "  if (actual !== expected) throw new Error(`${input}: expected ${expected}, got ${actual}`);",
    "}",
    'const absent = normalizeToolName("BashCap", [{ name: "read" }]);',
    'if (absent !== "bashcap") throw new Error(`absent alias should remain normalized input, got ${absent}`);',
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

console.log("025 tool-name normalization smoke passed");
