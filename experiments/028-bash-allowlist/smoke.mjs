import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DRIVER = resolve(__dirname, "bash_allowlist_driver.ts");

writeFileSync(
  DRIVER,
  [
    'import { commandRoot, validateBashCommand } from "../../packages/sarvam-provider/bash-policy.ts";',
    'import { envelopeForRole } from "../../packages/shoshin-harness/src/capabilities/role-envelopes.js";',
    'import { toPiPlan } from "../../packages/shoshin-harness/src/capabilities/to-pi-tools.js";',
    'const builderEnv = toPiPlan(envelopeForRole("builder", { cwd: "C:/tmp/project", scopePath: "app/" })).envOverrides;',
    'if (builderEnv.SARVAM_PI_BASH_ALLOWED_COMMANDS !== "test,build,lint,go,npm,tsc,vitest,pytest") throw new Error("builder bash allowlist env missing");',
    'if (commandRoot("cd app && go test ./...") !== "go") throw new Error("cd prefix root failed");',
    'if (commandRoot("npm run build") !== "npm run build") throw new Error("npm run root failed");',
    'if (commandRoot("git diff --stat") !== "git diff") throw new Error("git subcommand root failed");',
    'const builderPolicy = { allowedCommands: builderEnv.SARVAM_PI_BASH_ALLOWED_COMMANDS.split(",") };',
    'const allowed = ["go test ./...", "cd app && npm test", "tsc --noEmit", "pytest"];',
    'for (const command of allowed) {',
    '  const result = validateBashCommand(command, builderPolicy);',
    '  if (!result.ok) throw new Error(`expected allowed ${command}: ${result.reason}`);',
    '}',
    'const blocked = ["curl https://example.com", "git status", "python3 -m http.server 8000"];',
    'for (const command of blocked) {',
    '  const result = validateBashCommand(command, builderPolicy);',
    '  if (result.ok) throw new Error(`expected blocked ${command}`);',
    '}',
    'const reviewerEnv = toPiPlan(envelopeForRole("reviewer", { cwd: "C:/tmp/project" })).envOverrides;',
    'const reviewerPolicy = { allowedCommands: reviewerEnv.SARVAM_PI_BASH_ALLOWED_COMMANDS.split(",") };',
    'if (!validateBashCommand("git diff --stat", reviewerPolicy).ok) throw new Error("reviewer should allow git diff");',
    'if (validateBashCommand("git reset --hard", reviewerPolicy).ok) throw new Error("reviewer should not allow git reset");',
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

console.log("028 bash allowlist smoke passed");
