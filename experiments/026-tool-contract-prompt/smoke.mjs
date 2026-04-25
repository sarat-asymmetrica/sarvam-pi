import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "tool_contract_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { envelopeForRole } from "../../packages/shoshin-harness/src/capabilities/role-envelopes.js";',
    'import { envelopeSummary, toPiPlan, toolContractForPrompt } from "../../packages/shoshin-harness/src/capabilities/to-pi-tools.js";',
    'import { buildSystemPrompt } from "../../packages/shoshin-harness/src/roles/prompt-builder.js";',
    'function promptFor(role, scopePath) {',
    '  const env = envelopeForRole(role, { cwd: "C:/tmp/project", scopePath });',
    '  const plan = toPiPlan(env);',
    '  return buildSystemPrompt({ role, scopePath, toolContract: toolContractForPrompt(env, plan), capabilitySummary: envelopeSummary(env) });',
    '}',
    'const architect = promptFor("architect");',
    'if (!architect.includes("Executable Pi tools:\\n  read, grep, find, ls")) throw new Error("architect missing concrete read-only tools");',
    'if (!architect.includes("Capability envelope (context only; not tool names):")) throw new Error("architect missing capability context label");',
    'if (!architect.includes("Never call ReadCap")) throw new Error("architect missing capability-name prohibition");',
    'if (architect.includes("Executable Pi tools:\\n  read, grep, find, ls, write")) throw new Error("architect prompt exposes write as executable");',
    'const builder = promptFor("builder", "app/");',
    'if (!builder.includes("Executable Pi tools:\\n  read, grep, find, ls, write, edit, bash")) throw new Error("builder missing concrete mutation tools");',
    'if (!builder.includes("Capability envelope (context only; not tool names):")) throw new Error("builder missing capability context label");',
    'if (!builder.includes("WriteCap<scope: app/>")) throw new Error("builder missing scoped capability context");',
    'const qa = promptFor("qa");',
    'if (!qa.includes("Executable Pi tools:\\n  read, bash")) throw new Error("qa missing concrete runtime tools");',
    'if (!qa.includes("BrowserCap")) throw new Error("qa should keep BrowserCap as context");',
    'if (!qa.includes("Do not invent browser, web-search, memory, advisory, spec, or user-talk tools.")) throw new Error("qa missing non-Pi tool prohibition");',
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

console.log("026 tool-contract prompt smoke passed");
