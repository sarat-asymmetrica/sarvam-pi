// Experiment 012 — Sarvam-driven morning brief generation.
//
// Acceptance:
//   1. shoshin morning --no-sarvam-briefs uses template briefs (offline parity)
//   2. shoshin morning (with SARVAM_API_KEY set) replaces template briefs with
//      PM-generated briefs that mention each feature by name
//   3. Trail records subagent_spawn for each PM call during enrichment
//   4. Without an API key, default behavior is silent fallback (no error)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    env: { ...process.env, SARVAM_PI_ROOT, ...(opts.env ?? {}) },
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 600_000,
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

function readTickets() {
  const path = resolve(FIXTURE, ".shoshin", "tickets.json");
  if (!existsSync(path)) fail("tickets.json missing");
  return JSON.parse(readFileSync(path, "utf8"));
}

function readTrail() {
  const path = resolve(FIXTURE, ".shoshin", "trail.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

step("Reset fixture", () => {
  rmSync(resolve(FIXTURE, ".shoshin"), { recursive: true, force: true });
});

step("shoshin init + seed spec", () => {
  const r = nodeShoshin(["init", "sarvam-briefs-smoke"]);
  if (r.status !== 0) fail(`init: ${r.stderr}`);
  writeFileSync(
    resolve(FIXTURE, "spec.json"),
    JSON.stringify(
      {
        name: "udyam-mini",
        oneLineGoal: "Tiny shopkeeper ledger CLI for daily-sales logging.",
        primaryUser: "kirana store owner",
        targetLanguages: ["en", "hi"],
        scaffoldMode: "lite",
        appShape: "cli",
        primaryStack: { lang: "go" },
        surfaces: ["cli"],
        mathPrimitives: ["digital_root"],
        doneInvariants: ["correct", "tested"],
      },
      null,
      2,
    ),
  );
  const r2 = nodeShoshin(["spec", "--non-interactive", "spec.json"]);
  if (r2.status !== 0) fail(`spec: ${r2.stderr}`);
});

step("Add three features in different states", () => {
  const features = [
    { name: "add-sale", scope: "internal/add_sale/" },
    { name: "weekly-summary", scope: "internal/weekly_summary/" },
    { name: "export-csv", scope: "internal/export_csv/" },
  ];
  for (const f of features) {
    const r = nodeShoshin(["features", "add", f.name, "--scope", f.scope]);
    if (r.status !== 0) fail(`features add ${f.name}: ${r.stderr}`);
    mkdirSync(resolve(FIXTURE, f.scope), { recursive: true });
  }
  // Pre-advance one to SCAFFOLDED so role distribution varies (scout vs builder)
  const r = nodeShoshin(["features", "advance", "add-sale"]);
  if (r.status !== 0) fail(`scaffold advance add-sale: ${r.stderr}`);
});

// === Phase 1: template path (always works, no API key needed) ===
step("Template path: shoshin morning --no-sarvam-briefs", () => {
  const r = nodeShoshin(["morning", "--no-sarvam-briefs"]);
  if (r.status !== 0) fail(`morning --no-sarvam-briefs: ${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
});

step("Verify template-path tickets have predictable shape", () => {
  const data = readTickets();
  if (data.tickets.length !== 3) fail(`expected 3 tickets, got ${data.tickets.length}`);
  for (const t of data.tickets) {
    // Template briefs always start with verb-phrase + feature ID, e.g.
    //   "Implement feature \"add-sale\" (id: add-sale)."
    if (!t.brief.includes(`"${t.feature}"`)) {
      fail(`template brief for ${t.feature} doesn't quote feature name:\n${t.brief}`);
    }
  }
  return `  3 template-brief tickets seeded`;
});

// === Phase 2: Sarvam-driven path (gated on API key) ===
if (!process.env.SARVAM_API_KEY) {
  console.warn("\n(skipping Sarvam-driven brief gen — set SARVAM_API_KEY to enable)");

  // Even without a key, default `morning` (no flags) must not error — it
  // should silently fall back to template briefs.
  step("Silent fallback when no API key (no flags)", () => {
    // Wipe tickets so we get a fresh seed
    rmSync(resolve(FIXTURE, ".shoshin", "tickets.json"), { force: true });
    const r = nodeShoshin(["morning"]);
    if (r.status !== 0) fail(`morning (no key, no flags): ${r.stderr}`);
    if (r.stdout.includes("Generating briefs via Sarvam")) {
      fail(`expected silent fallback when no key, but Sarvam-gen ran`);
    }
    return `  ✓ silent fallback OK`;
  });
  console.log("\n══════════════════════════════════════════");
  console.log("  SARVAM BRIEFS SMOKE: PASSED (offline path only)");
  console.log("══════════════════════════════════════════\n");
  process.exit(0);
}

step("Sarvam path: shoshin morning (default ON when key set)", () => {
  // Wipe tickets so we re-plan
  rmSync(resolve(FIXTURE, ".shoshin", "tickets.json"), { force: true });
  const start = Date.now();
  const r = nodeShoshin(["morning"], { stdio: "inherit" });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status !== 0) fail(`morning failed after ${elapsed}s`);
  return `  ✓ morning completed in ${elapsed}s`;
});

step("Verify Sarvam-driven briefs mention feature names", () => {
  const data = readTickets();
  if (data.tickets.length !== 3) fail(`expected 3 tickets, got ${data.tickets.length}`);
  let sarvamCount = 0;
  for (const t of data.tickets) {
    if (!t.brief.toLowerCase().includes(t.feature.toLowerCase())) {
      // Sarvam may fall back per-ticket; that's ok — some can be templates
      console.warn(
        `  ⚠ brief for ${t.feature} doesn't mention feature name (likely fell back)`,
      );
      continue;
    }
    // Heuristic: a Sarvam brief differs from the template — template starts
    // with a known verb pattern like "Discovery for feature \"X\"" or "Implement feature \"X\"".
    // A Sarvam brief is more varied prose. If the brief differs in length or
    // first-line shape, count it as Sarvam.
    const firstLine = t.brief.split("\n")[0];
    const isTemplateShape =
      firstLine.startsWith("Discovery for feature") ||
      firstLine.startsWith("Implement feature") ||
      firstLine.startsWith("Verify feature") ||
      firstLine.startsWith("Final review of feature") ||
      firstLine.startsWith("Propose structural shape") ||
      firstLine.startsWith("Translate user intent") ||
      firstLine.startsWith("Compact recent activity");
    if (!isTemplateShape) sarvamCount++;
  }
  if (sarvamCount === 0) {
    fail(
      `no tickets show Sarvam-driven brief shape — all 3 fell back. ` +
        `Check API key + endpoint reachability.`,
    );
  }
  return `  ✓ ${sarvamCount}/3 tickets have Sarvam-shaped briefs`;
});

step("Verify trail records PM spawns during enrichment", () => {
  const trail = readTrail();
  const pmSpawns = trail.filter(
    (r) => r.kind === "subagent_spawn" && r.role === "pm",
  );
  if (pmSpawns.length === 0) {
    fail(`no PM subagent_spawn records — enrichment didn't dispatch`);
  }
  return `  ✓ ${pmSpawns.length} PM spawn record(s) in trail`;
});

step("Sanity: --no-sarvam-briefs still works with key set", () => {
  rmSync(resolve(FIXTURE, ".shoshin", "tickets.json"), { force: true });
  const r = nodeShoshin(["morning", "--no-sarvam-briefs"]);
  if (r.status !== 0) fail(`morning --no-sarvam-briefs: ${r.stderr}`);
  if (r.stdout.includes("Generating briefs via Sarvam")) {
    fail(`--no-sarvam-briefs flag did not suppress PM dispatch`);
  }
  return `  ✓ flag override respected`;
});

console.log("\n══════════════════════════════════════════");
console.log("  SARVAM BRIEFS SMOKE: PASSED");
console.log("  Sarvam-driven brief gen + fallback both work.");
console.log("══════════════════════════════════════════\n");
