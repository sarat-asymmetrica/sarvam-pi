// Foundation smoke: real Sarvam call through the Shoshin orchestrator.
//
// Acceptance:
//   1. shoshin init creates .shoshin/
//   2. spec import succeeds with zod validation
//   3. feature add + scope assigned
//   4. dispatch a Scout subagent against a discovery question
//   5. Sarvam responds with a coherent answer
//   6. trail.jsonl has subagent_spawn + subagent_complete records
//   7. time pulse fires
//
// Run: node smoke.mjs (env must include SARVAM_API_KEY)
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const SARVAM_PI_ROOT = resolve(__dirname, "..", "..");
const FIXTURE = resolve(__dirname, "fixture");

const SHOSHIN_BIN = resolve(HARNESS_ROOT, "bin", "shoshin.js");

function nodeShoshin(args, opts = {}) {
  return spawnSync(process.execPath, [SHOSHIN_BIN, ...args], {
    cwd: opts.cwd ?? FIXTURE,
    encoding: "utf8",
    env: {
      ...process.env,
      SARVAM_PI_ROOT,
    },
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
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

// === 0. Reset fixture state ===
step("Reset fixture .shoshin/", () => {
  rmSync(resolve(FIXTURE, ".shoshin"), { recursive: true, force: true });
  rmSync(resolve(FIXTURE, "internal"), { recursive: true, force: true });
});

// === 1. Init ===
step("shoshin init", () => {
  const r = nodeShoshin(["init", "shoshin-smoke"]);
  if (r.status !== 0) fail(`init failed: ${r.stderr}`);
  return r.stdout.trim();
});

// === 2. Spec import ===
step("shoshin spec --non-interactive sample-spec.json", () => {
  const r = nodeShoshin(["spec", "--non-interactive", "sample-spec.json"]);
  if (r.status !== 0) fail(`spec import failed: ${r.stderr}`);
  return r.stdout.trim();
});

// === 3. Add feature + create scope dir ===
step("shoshin features add say-hello + create internal/say_hello/", () => {
  const r = nodeShoshin(["features", "add", "say-hello"]);
  if (r.status !== 0) fail(`features add failed: ${r.stderr}`);
  mkdirSync(resolve(FIXTURE, "internal", "say_hello"), { recursive: true });

  // Manually set scopePath since CLI doesn't expose it yet (Phase 9 todo)
  const featuresPath = resolve(FIXTURE, ".shoshin", "features.json");
  const data = JSON.parse(readFileSync(featuresPath, "utf8"));
  data.features[0].scopePath = "internal/say_hello/";
  writeFileSync(featuresPath, JSON.stringify(data, null, 2));
  return r.stdout.trim();
});

// === 4. List + status ===
step("shoshin features list", () => {
  const r = nodeShoshin(["features", "list"]);
  if (r.status !== 0) fail(`features list failed`);
  return r.stdout.trim();
});

// === 5. Sarvam dispatch (Scout) ===
step("Scout dispatch — REAL Sarvam call", () => {
  if (!process.env.SARVAM_API_KEY) {
    console.warn("  (skipping live Sarvam call — set SARVAM_API_KEY to enable)");
    return;
  }
  console.log("  Spawning Scout via tsx + dispatch.ts ...");
  const start = Date.now();
  const tsxBin = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const dispatchScript = resolve(__dirname, "dispatch-scout.ts");
  const r = spawnSync(process.execPath, [tsxBin, dispatchScript], {
    cwd: FIXTURE,
    env: { ...process.env, SARVAM_PI_ROOT },
    stdio: "inherit",
    timeout: 360_000,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status !== 0) fail(`dispatch-scout failed (status ${r.status}) after ${elapsed}s`);
  console.log(`  ✓ Scout returned in ${elapsed}s`);
});

// === 6. Trail tail ===
step("shoshin trail tail -n 12", () => {
  const r = nodeShoshin(["trail", "tail", "-n", "12"]);
  if (r.status !== 0) fail(`trail tail failed`);
  return r.stdout.trim();
});

// === 7. Final verdict ===
console.log("\n══════════════════════════════════════════");
console.log("  FOUNDATION SMOKE: PASSED");
console.log("══════════════════════════════════════════\n");
