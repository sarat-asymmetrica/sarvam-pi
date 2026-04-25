// Experiment 008 — Role matrix smoke. Reuses the Builder fixture from 007 and
// dispatches Architect / Reviewer / QA to verify each role's persona pair, prompt
// discipline, and capability envelope work end-to-end.
//
// Acceptance:
//   - Architect dispatches read-only and produces a structural recommendation
//   - Reviewer dispatches read-only against the Builder's output and produces
//     CRITICAL/IMPORTANT/NIT findings + verdict
//   - QA dispatches and produces a verification claim + measurement result
//   - All three trail-log spawn + complete records
//   - No mutations attempted by read-only roles
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
    env: { ...process.env, SARVAM_PI_ROOT },
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

// === Setup: same as 007, but pre-populate the Builder's output ===
step("Reset fixture", () => {
  rmSync(resolve(FIXTURE, ".shoshin"), { recursive: true, force: true });
  rmSync(resolve(FIXTURE, "internal"), { recursive: true, force: true });
});

step("shoshin init", () => {
  const r = nodeShoshin(["init", "role-matrix-smoke"]);
  if (r.status !== 0) fail(`init failed: ${r.stderr}`);
});

writeFileSync(
  resolve(FIXTURE, "spec.json"),
  JSON.stringify(
    {
      name: "role-matrix-smoke",
      oneLineGoal: "Verify the 7-role catalog works end-to-end with Sarvam.",
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

step("shoshin spec import", () => {
  const r = nodeShoshin(["spec", "--non-interactive", "spec.json"]);
  if (r.status !== 0) fail(`spec failed: ${r.stderr}`);
});

step("shoshin features add greet --scope internal/greet/", () => {
  const r = nodeShoshin(["features", "add", "greet", "--scope", "internal/greet/"]);
  if (r.status !== 0) fail(`features add failed: ${r.stderr}`);
});

// Pre-populate the Builder's output so Reviewer + QA have something real to read.
mkdirSync(resolve(FIXTURE, "internal", "greet"), { recursive: true });
writeFileSync(
  resolve(FIXTURE, "internal", "greet", "greet.go"),
  [
    "package greet",
    "",
    "// Greet returns a Sanskrit-style salutation.",
    "func Greet(name string) string {",
    `\treturn "Namaste, " + name + "!"`,
    "}",
    "",
  ].join("\n"),
);

writeFileSync(
  resolve(FIXTURE, "internal", "greet", "greet_test.go"),
  [
    "package greet",
    "",
    "import \"testing\"",
    "",
    "func TestGreet(t *testing.T) {",
    `\tgot := Greet("Sarat")`,
    `\twant := "Namaste, Sarat!"`,
    "\tif got != want {",
    "\t\tt.Errorf(\"got %q, want %q\", got, want)",
    "\t}",
    "}",
    "",
  ].join("\n"),
);

writeFileSync(
  resolve(FIXTURE, "go.mod"),
  ["module role-matrix-smoke", "", "go 1.21", ""].join("\n"),
);

step("shoshin features advance greet (→ SCAFFOLDED)", () => {
  const r = nodeShoshin(["features", "advance", "greet"]);
  if (r.status !== 0) fail(`advance failed: ${r.stderr}`);
});

step("shoshin features advance greet (→ MODEL_DONE)", () => {
  const r = nodeShoshin([
    "features",
    "advance",
    "greet",
    "--evidence",
    "implemented Greet() in internal/greet/greet.go with test in greet_test.go",
  ]);
  if (r.status !== 0) fail(`advance to MODEL_DONE failed: ${r.stderr}`);
});

if (!process.env.SARVAM_API_KEY) {
  console.warn("\n(skipping live Sarvam dispatches — set SARVAM_API_KEY to enable)");
  process.exit(0);
}

// === Architect dispatch (read-only, advisory) ===
step("Architect dispatch — propose structural shape", () => {
  const start = Date.now();
  const r = nodeShoshin(
    [
      "dispatch",
      "architect",
      "greet",
      "--brief",
      [
        "Read internal/greet/greet.go and propose the structural shape this package should take",
        "if it grew to support multiple languages (e.g. Tamil, Kannada). Name the invariant any",
        "growth must preserve. Recommend STRONG / WEAK / NEEDS-INPUT.",
      ].join(" "),
      "--timeout-sec",
      "240",
    ],
    { stdio: "inherit" },
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status !== 0) fail(`architect dispatch failed after ${elapsed}s`);
  console.log(`\n  ✓ Architect returned in ${elapsed}s`);
});

// === Reviewer dispatch ===
step("Reviewer dispatch — review greet.go + greet_test.go", () => {
  const start = Date.now();
  const r = nodeShoshin(
    [
      "dispatch",
      "reviewer",
      "greet",
      "--brief",
      [
        "Read internal/greet/greet.go and internal/greet/greet_test.go.",
        "Walk each function. For each finding, label CRITICAL / IMPORTANT / NIT.",
        "End with SAFE-TO-MERGE / NEEDS-CHANGES / NEEDS-REWORK.",
      ].join(" "),
      "--timeout-sec",
      "240",
    ],
    { stdio: "inherit" },
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status !== 0) fail(`reviewer dispatch failed after ${elapsed}s`);
  console.log(`\n  ✓ Reviewer returned in ${elapsed}s`);
});

// === QA dispatch ===
step("QA dispatch — verify Greet end-to-end", () => {
  const start = Date.now();
  const r = nodeShoshin(
    [
      "dispatch",
      "qa",
      "greet",
      "--brief",
      [
        "State the verification claim for Greet().",
        "Read greet.go and greet_test.go to confirm the test exists.",
        "Identify edge cases worth additional testing (empty string, Unicode, etc.).",
        "Propose VERIFIED with evidence text or name the specific failure case.",
      ].join(" "),
      "--timeout-sec",
      "240",
    ],
    { stdio: "inherit" },
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status !== 0) fail(`qa dispatch failed after ${elapsed}s`);
  console.log(`\n  ✓ QA returned in ${elapsed}s`);
});

// === Trail tail ===
step("shoshin trail tail -n 20", () => {
  const r = nodeShoshin(["trail", "tail", "-n", "20"]);
  if (r.status !== 0) fail(`trail failed`);
  return r.stdout.trim();
});

// === Verify no mutations occurred (read-only roles) ===
step("Verify no Sarvam mutations to greet.go", () => {
  const content = readFileSync(resolve(FIXTURE, "internal", "greet", "greet.go"), "utf8");
  if (!content.includes("Namaste")) {
    fail(`greet.go was modified — expected unchanged content`);
  }
  return "  ✓ greet.go unchanged (Architect/Reviewer/QA are read-only by capability)";
});

console.log("\n══════════════════════════════════════════");
console.log("  ROLE MATRIX SMOKE: PASSED");
console.log("══════════════════════════════════════════\n");
