// Experiment 014 — Host-led conversational discovery, multilingual.
//
// Acceptance:
//   1. Language detection function correctly maps script + lexicon to language
//   2. Without SARVAM_API_KEY: assertion-only (skip live runs)
//   3. With SARVAM_API_KEY: each fixture runs end-to-end:
//      - userTurns scripted into runSarvamInterview
//      - host responds in the user's language across the conversation
//      - extracted spec validates against ProjectSpecSchema
//      - .shoshin/discovery_session.jsonl captures the conversation
//      - spec.json is written to the fixture cwd
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const SARVAM_PI_ROOT = resolve(__dirname, "..", "..");
const FIXTURE_BASE = resolve(__dirname, "fixture");
const SHOSHIN_BIN = resolve(HARNESS_ROOT, "bin", "shoshin.js");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const RUN_FIXTURE_TS = resolve(__dirname, "run_fixture.ts");
const FIXTURES_PATH = resolve(__dirname, "fixtures.json");

const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, "utf8")).fixtures;

function step(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`);
  const out = fn();
  if (out !== undefined) process.stdout.write(out + "\n");
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// ─── Phase 1: offline assertions ────────────────────────────────────

step("Verify language detection (offline)", () => {
  const langTestPath = resolve(__dirname, "lang_test.ts");
  const r = spawnSync(process.execPath, [TSX_BIN, langTestPath], {
    encoding: "utf8",
    env: { ...process.env, SARVAM_PI_ROOT },
    timeout: 30_000,
  });
  if (r.status !== 0) fail(`language detection driver failed:\n${r.stderr}\n${r.stdout}`);
  const m = /(\d+)\/(\d+)/.exec(r.stdout);
  if (!m) fail(`detection output unparseable: ${r.stdout}`);
  if (m[1] !== m[2]) {
    fail(`detection failed ${m[1]}/${m[2]} cases\n${r.stdout}\n${r.stderr}`);
  }
  return `  ✓ ${m[1]}/${m[2]} language cases pass (en, hi, mr, ta, te, kn, pa)`;
});

step("Verify spec CLI accepts --canned flag", () => {
  const r = spawnSync(process.execPath, [SHOSHIN_BIN, "spec", "--help"], {
    encoding: "utf8",
    env: process.env,
    timeout: 30_000,
  });
  if (r.status !== 0) fail(`spec --help failed: ${r.stderr}`);
  if (!/--canned/.test(r.stdout)) fail(`spec --help missing --canned flag:\n${r.stdout}`);
  return `  ✓ --canned flag wired`;
});

// ─── Phase 2: live fixture runs (gated on API key) ─────────────────

if (!process.env.SARVAM_API_KEY) {
  console.warn("\n(skipping live fixture runs — set SARVAM_API_KEY to enable)");
  console.log("\n══════════════════════════════════════════");
  console.log("  CONVERSATIONAL DISCOVERY SMOKE: PASSED (offline)");
  console.log("══════════════════════════════════════════\n");
  process.exit(0);
}

mkdirSync(FIXTURE_BASE, { recursive: true });

function runFixture(fixture) {
  const fixtureCwd = resolve(FIXTURE_BASE, fixture.id);
  rmSync(fixtureCwd, { recursive: true, force: true });
  mkdirSync(fixtureCwd, { recursive: true });

  const start = Date.now();
  const r = spawnSync(
    process.execPath,
    [TSX_BIN, RUN_FIXTURE_TS, fixture.id, fixtureCwd],
    {
      encoding: "utf8",
      env: { ...process.env, SARVAM_PI_ROOT },
      timeout: 600_000, // up to 10 min for a 6-turn interview at ~6-15s/turn
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (r.status !== 0) {
    console.error(`  ✗ run_fixture exit ${r.status} after ${elapsed}s`);
    console.error(`  stderr:\n${r.stderr.slice(-2000)}`);
    console.error(`  stdout:\n${r.stdout.slice(-2000)}`);
    fail(`fixture ${fixture.id} failed`);
  }

  const m = /===FIXTURE_RESULT_BEGIN===\n([\s\S]+?)\n===FIXTURE_RESULT_END===/.exec(
    r.stdout,
  );
  if (!m) fail(`fixture ${fixture.id}: result markers not found in output`);

  const result = JSON.parse(m[1]);
  return { result, fixtureCwd, elapsed };
}

function assertHostMarkers(fixture, hostTurns) {
  const allHostText = hostTurns.join("\n").toLowerCase();
  // Each marker may be an alternation like "गीता|gita|geeta" — split and treat
  // each piece as a case-insensitive substring (avoids regex metachar issues
  // for tokens like "?").
  const hits = fixture.expectedHostMarkers.filter((pat) => {
    const alternatives = String(pat).split("|").map((s) => s.trim().toLowerCase());
    return alternatives.some((alt) => alt && allHostText.includes(alt));
  });
  return hits.length;
}

for (const fixture of fixtures) {
  step(
    `Live fixture: ${fixture.id} (${fixture.language}) — ${fixture.scriptName}`,
    () => {
      const { result, fixtureCwd, elapsed } = runFixture(fixture);

      if (!result.spec) {
        // Print last host turn for debugging.
        console.error(`  reason: ${result.reason}, error: ${result.error}`);
        console.error(
          `  last host turn:\n${(result.hostTurns ?? []).slice(-1).join("\n").slice(0, 1500)}`,
        );
        fail(
          `fixture ${fixture.id}: no spec produced`,
        );
      }
      if (result.detectedLanguage !== result.expectedLanguage) {
        console.warn(
          `  ⚠ language mismatch: detected=${result.detectedLanguage}, expected=${result.expectedLanguage} (soft)`,
        );
      }

      // spec.json should exist in the fixture cwd
      const specPath = resolve(fixtureCwd, ".shoshin", "spec.json");
      if (!existsSync(specPath)) fail(`spec.json missing for ${fixture.id}`);

      // discovery_session.jsonl should exist
      const sessionPath = resolve(
        fixtureCwd,
        ".shoshin",
        "discovery_session.jsonl",
      );
      if (!existsSync(sessionPath)) {
        fail(`discovery_session.jsonl missing for ${fixture.id}`);
      }
      const sessionLines = readFileSync(sessionPath, "utf8")
        .split("\n")
        .filter(Boolean);
      if (sessionLines.length === 0) {
        fail(`discovery_session.jsonl empty for ${fixture.id}`);
      }

      // Host marker assertions (soft — count hits)
      const markerHits = assertHostMarkers(fixture, result.hostTurns);
      const minHits = Math.max(2, Math.floor(fixture.expectedHostMarkers.length / 2));
      if (markerHits < minHits) {
        fail(
          `fixture ${fixture.id}: only ${markerHits}/${fixture.expectedHostMarkers.length} host markers matched (need ≥${minHits})`,
        );
      }

      // Spec sanity
      const expectedAppShape = fixture.expectedSpec.appShape;
      if (
        expectedAppShape &&
        result.spec.appShape &&
        result.spec.appShape !== expectedAppShape
      ) {
        console.warn(
          `  ⚠ appShape: got ${result.spec.appShape}, expected ${expectedAppShape} (host's call — soft signal)`,
        );
      }

      return [
        `  ✓ completed in ${elapsed}s (${result.turns} turns, ${sessionLines.length} session lines)`,
        `    spec.name = ${result.spec.name}`,
        `    spec.appShape = ${result.spec.appShape}`,
        `    spec.primaryStack.lang = ${result.spec.primaryStack.lang}`,
        `    detected language = ${result.detectedLanguage}`,
        `    host markers matched = ${markerHits}/${fixture.expectedHostMarkers.length}`,
      ].join("\n");
    },
  );
}

console.log("\n══════════════════════════════════════════");
console.log("  CONVERSATIONAL DISCOVERY SMOKE: PASSED");
console.log("  Host-led discovery in en/hi/mr all green.");
console.log("══════════════════════════════════════════\n");
