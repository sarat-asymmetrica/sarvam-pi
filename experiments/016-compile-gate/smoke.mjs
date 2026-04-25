// Experiment 016 - compile/import gate for VERIFIED transitions.
//
// Offline smoke: exercise the reusable gate directly against passing, failing,
// and unconfigured fixtures so B11 can harden without spending Sarvam tokens.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const FIXTURE = resolve(__dirname, "fixture");

function fail(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

function step(label, fn) {
  process.stdout.write(`\n> ${label}\n`);
  const out = fn();
  if (out !== undefined) process.stdout.write(`${out}\n`);
}

step("Reset fixture", () => {
  rmSync(FIXTURE, { recursive: true, force: true });
  mkdirSync(FIXTURE, { recursive: true });
});

step("Create Go pass/fail fixtures", () => {
  const pass = resolve(FIXTURE, "go-pass");
  const failDir = resolve(FIXTURE, "go-fail");
  mkdirSync(resolve(pass, "internal", "hello"), { recursive: true });
  mkdirSync(resolve(failDir, "internal", "broken"), { recursive: true });
  writeFileSync(resolve(pass, "go.mod"), "module example.com/pass\n\ngo 1.22\n", "utf8");
  writeFileSync(
    resolve(pass, "internal", "hello", "hello.go"),
    "package hello\n\nfunc Greet(name string) string { return \"Namaste, \" + name }\n",
    "utf8",
  );
  writeFileSync(resolve(failDir, "go.mod"), "module example.com/fail\n\ngo 1.22\n", "utf8");
  writeFileSync(
    resolve(failDir, "internal", "broken", "broken.go"),
    "package broken\n\nfunc Broken() string { return 42 }\n",
    "utf8",
  );
  return "  fixtures ready";
});

step("Run compile gate driver", () => {
  const driver = resolve(__dirname, "compile_gate_test.ts");
  writeFileSync(
    driver,
    [
      'import { runCompileOrImportGate } from "../../packages/shoshin-harness/src/orchestrator/compile-gate.js";',
      `const fixture = ${JSON.stringify(FIXTURE)};`,
      'const spec = { name: "x", oneLineGoal: "x", primaryUser: "x", targetLanguages: ["en"], primaryStack: { lang: "go" }, scaffoldMode: "lite", appShape: "cli", surfaces: ["cli"], mathPrimitives: [], doneInvariants: ["correct"], source: "manual" } as const;',
      'const pass = runCompileOrImportGate({ cwd: `${fixture}/go-pass`, spec });',
      'if (!pass.ok || pass.status !== "passed") throw new Error(`expected pass, got ${JSON.stringify(pass)}`);',
      'const bad = runCompileOrImportGate({ cwd: `${fixture}/go-fail`, spec });',
      'if (bad.ok || bad.status !== "failed") throw new Error(`expected failure, got ${JSON.stringify(bad)}`);',
      'const skip = runCompileOrImportGate({ cwd: fixture, spec });',
      'if (!skip.ok || skip.status !== "skipped" || !skip.reason?.includes("go.mod")) throw new Error(`expected skip, got ${JSON.stringify(skip)}`);',
      'console.log(JSON.stringify({ pass: pass.command, bad: bad.reason, skip: skip.reason }, null, 2));',
    ].join("\n"),
    "utf8",
  );
  const r = spawnSync(process.execPath, [TSX_BIN, driver], {
    encoding: "utf8",
    timeout: 60_000,
  });
  rmSync(driver, { force: true });
  if (r.status !== 0) fail(`compile gate driver failed:\n${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
});

console.log("\nCOMPILE GATE SMOKE: PASSED\n");
