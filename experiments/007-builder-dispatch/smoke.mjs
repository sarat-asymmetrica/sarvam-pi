// Experiment 007 — Builder dispatch demo.
//
// Goal: Sarvam, in the Builder role with Ramanujan + Hamilton persona pair and
// the 14 axioms, advances a feature REQUESTED → SCAFFOLDED → MODEL_DONE by
// actually writing Go code under the scoped path internal/say_hello/.
//
// Acceptance:
//   1. Feature created with --scope flag
//   2. SCAFFOLDED transition succeeds (scope dir exists)
//   3. Builder dispatch produces a write to internal/say_hello/say_hello.go
//   4. Mutation guard fires on out-of-scope attempts (verified separately)
//   5. ELEGANCE_CHECK appears in Builder output
//   6. Feature advances MODEL_DONE with the Builder's output as evidence
//   7. Trail has spawn + complete + feature_advance records
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const SARVAM_PI_ROOT = resolve(__dirname, "..", "..");
const FIXTURE = resolve(__dirname, "fixture");
const SHOSHIN_BIN = resolve(HARNESS_ROOT, "bin", "shoshin.js");

mkdirSync(FIXTURE, { recursive: true });

function nodeShoshin(args, opts = {}) {
  return spawnSync(process.execPath, [SHOSHIN_BIN, ...args], {
    cwd: opts.cwd ?? FIXTURE,
    encoding: "utf8",
    env: {
      ...process.env,
      SARVAM_PI_ROOT,
    },
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 360_000,
  });
}

function step(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`);
  const out = fn();
  if (out !== undefined) process.stdout.write(out + "\n");
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// === 0. Reset fixture ===
step("Reset fixture", () => {
  rmSync(resolve(FIXTURE, ".shoshin"), { recursive: true, force: true });
  rmSync(resolve(FIXTURE, "internal"), { recursive: true, force: true });
});

// === 1. Init + minimal spec ===
step("shoshin init builder-smoke", () => {
  const r = nodeShoshin(["init", "builder-smoke"]);
  if (r.status !== 0) fail(`init failed: ${r.stderr}`);
  return r.stdout.trim();
});

// Write a minimal spec inline (skip interview)
writeFileSync(
  resolve(FIXTURE, "spec.json"),
  JSON.stringify(
    {
      name: "builder-smoke",
      oneLineGoal: "Tiny Go package that greets a user in Sanskrit-friendly style.",
      primaryUser: "shoshin developer",
      targetLanguages: ["en"],
      scaffoldMode: "lite",
      appShape: "cli",
      primaryStack: { lang: "go" },
      surfaces: ["cli"],
      mathPrimitives: [],
      doneInvariants: ["correct", "tested"],
    },
    null,
    2,
  ),
);

step("shoshin spec --non-interactive spec.json", () => {
  const r = nodeShoshin(["spec", "--non-interactive", "spec.json"]);
  if (r.status !== 0) fail(`spec failed: ${r.stderr}`);
  return r.stdout.trim();
});

// === 2. Add feature with scope; create scope dir; advance to SCAFFOLDED ===
step("shoshin features add say-hello --scope internal/say_hello/", () => {
  const r = nodeShoshin(["features", "add", "say-hello", "--scope", "internal/say_hello/"]);
  if (r.status !== 0) fail(`features add failed: ${r.stderr}`);
  return r.stdout.trim();
});

mkdirSync(resolve(FIXTURE, "internal", "say_hello"), { recursive: true });

step("shoshin features advance say-hello (→ SCAFFOLDED)", () => {
  const r = nodeShoshin(["features", "advance", "say-hello"]);
  if (r.status !== 0) fail(`advance to SCAFFOLDED failed: ${r.stderr}`);
  return r.stdout.trim();
});

// === 3. Builder dispatch — REAL Sarvam writes Go code ===
step("Builder dispatch — Sarvam writes internal/say_hello/say_hello.go", () => {
  if (!process.env.SARVAM_API_KEY) {
    console.warn("  (skipping — set SARVAM_API_KEY to enable)");
    return;
  }
  const start = Date.now();
  const brief = [
    "Implement a Go package `sayhello` at internal/say_hello/say_hello.go with:",
    "  - package declaration `package sayhello`",
    "  - exported function `Greet(name string) string` that returns `\"Namaste, \" + name + \"!\"`",
    "  - one short comment above the function explaining its purpose",
    "",
    "Discipline:",
    "  - Stay strictly inside scope (internal/say_hello/).",
    "  - After writing, READ the file back to verify content.",
    "  - End your response with the ELEGANCE_CHECK ritual as plain prose.",
  ].join("\n");

  const r = nodeShoshin(
    [
      "dispatch",
      "builder",
      "say-hello",
      "--brief",
      brief,
      "--advance-to",
      "MODEL_DONE",
      "--timeout-sec",
      "300",
    ],
    { stdio: "inherit", timeout: 360_000 },
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status !== 0) fail(`builder dispatch failed (status ${r.status}) after ${elapsed}s`);
  console.log(`\n  ✓ Builder dispatch returned in ${elapsed}s`);
});

// === 4. Verify the file was actually written ===
step("Verify internal/say_hello/say_hello.go exists with Greet()", () => {
  const target = resolve(FIXTURE, "internal", "say_hello", "say_hello.go");
  if (!existsSync(target)) {
    fail(`expected file missing: ${target}`);
  }
  const content = readFileSync(target, "utf8");
  if (!content.includes("Greet")) {
    fail(`file exists but no Greet() — content: ${content.slice(0, 300)}`);
  }
  return `  found ${content.length}B, has Greet():\n${content.split("\n").slice(0, 10).join("\n")}`;
});

// === 5. Verify feature advanced ===
step("shoshin features status say-hello", () => {
  const r = nodeShoshin(["features", "status", "say-hello"]);
  if (r.status !== 0) fail(`status failed: ${r.stderr}`);
  if (!r.stdout.includes("MODEL_DONE")) {
    fail(`expected MODEL_DONE in status, got:\n${r.stdout}`);
  }
  return r.stdout.trim();
});

// === 6. Trail tail ===
step("shoshin trail tail -n 12", () => {
  const r = nodeShoshin(["trail", "tail", "-n", "12"]);
  if (r.status !== 0) fail(`trail tail failed`);
  return r.stdout.trim();
});

console.log("\n══════════════════════════════════════════");
console.log("  BUILDER DISPATCH SMOKE: PASSED");
console.log("══════════════════════════════════════════\n");
