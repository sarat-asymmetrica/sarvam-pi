// Experiment 009 — Math primitive scaffolding smoke.
//
// Acceptance:
//   1. ProjectSpec selects expected primitives based on appShape/surfaces
//   2. shoshin scaffold-math copies the chosen templates into internal/math/
//   3. The copied packages compile and pass their tests in the target tree
//   4. --dry-run mode shows selection without writing
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
    timeout: opts.timeout ?? 60_000,
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

step("Reset fixture", () => {
  rmSync(resolve(FIXTURE, ".shoshin"), { recursive: true, force: true });
  rmSync(resolve(FIXTURE, "internal"), { recursive: true, force: true });
  rmSync(resolve(FIXTURE, "go.mod"), { force: true });
  rmSync(resolve(FIXTURE, "go.sum"), { force: true });
});

step("shoshin init", () => {
  const r = nodeShoshin(["init", "math-scaffold-smoke"]);
  if (r.status !== 0) fail(`init: ${r.stderr}`);
});

// Spec selects: digital_root (surface=miniapp), williams (api), quaternion
// (telegram surface), regime (observable invariant). All four primitives.
writeFileSync(
  resolve(FIXTURE, "spec.json"),
  JSON.stringify(
    {
      name: "math-scaffold-smoke",
      oneLineGoal: "Verify math primitive scaffolding selects + writes correctly.",
      primaryUser: "shoshin developer",
      targetLanguages: ["en"],
      scaffoldMode: "lite",
      appShape: "api",
      primaryStack: { lang: "go" },
      surfaces: ["telegram", "miniapp"],
      mathPrimitives: [],
      doneInvariants: ["correct", "tested", "observable"],
    },
    null,
    2,
  ),
);
step("shoshin spec import", () => {
  const r = nodeShoshin(["spec", "--non-interactive", "spec.json"]);
  if (r.status !== 0) fail(`spec: ${r.stderr}`);
});

step("shoshin scaffold-math --dry-run", () => {
  const r = nodeShoshin(["scaffold-math", "--dry-run"]);
  if (r.status !== 0) fail(`dry-run: ${r.stderr}`);
  if (!r.stdout.includes("digital_root") || !r.stdout.includes("williams") ||
      !r.stdout.includes("quaternion") || !r.stdout.includes("regime")) {
    fail(`expected all 4 primitives in dry-run output:\n${r.stdout}`);
  }
  if (existsSync(resolve(FIXTURE, "internal", "math"))) {
    fail("--dry-run should not have written internal/math/");
  }
  return r.stdout.trim();
});

step("shoshin scaffold-math (real write)", () => {
  const r = nodeShoshin(["scaffold-math"]);
  if (r.status !== 0) fail(`scaffold: ${r.stderr}`);
  return r.stdout.trim();
});

step("Verify all primitive files exist", () => {
  const expected = [
    "internal/math/digital_root/dr.go",
    "internal/math/digital_root/dr_test.go",
    "internal/math/williams/williams.go",
    "internal/math/williams/williams_test.go",
    "internal/math/quaternion/quaternion.go",
    "internal/math/quaternion/quaternion_test.go",
    "internal/math/regime/regime.go",
    "internal/math/regime/regime_test.go",
  ];
  for (const f of expected) {
    if (!existsSync(resolve(FIXTURE, f))) {
      fail(`missing: ${f}`);
    }
  }
  return `  ${expected.length} files written ✓`;
});

step("Add go.mod for fixture + run tests", () => {
  writeFileSync(
    resolve(FIXTURE, "go.mod"),
    `module math-scaffold-smoke\n\ngo 1.21\n`,
  );
  const r = spawnSync("go", ["test", "./internal/math/..."], {
    cwd: FIXTURE,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (r.status !== 0) {
    fail(`go test failed:\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout.trim();
});

console.log("\n══════════════════════════════════════════");
console.log("  MATH SCAFFOLD SMOKE: PASSED");
console.log("══════════════════════════════════════════\n");
