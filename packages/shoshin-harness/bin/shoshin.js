#!/usr/bin/env node
// Shoshin CLI launcher. Invokes the local tsx CLI to run src/cli.ts. Works from any
// cwd because the harness package owns tsx in its own node_modules; target user
// repos do not need tsx installed.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const harnessRoot = join(__dirname, "..");
const cliPath = join(harnessRoot, "src", "cli.ts");
const tsxBin = join(harnessRoot, "node_modules", "tsx", "dist", "cli.mjs");

const child = spawn(process.execPath, [tsxBin, cliPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[shoshin] launcher failed:", err);
  process.exit(1);
});
