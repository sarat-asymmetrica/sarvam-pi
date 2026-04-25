// Experiment 011 — PM + Librarian dispatch smokes.
//
// Closes the role matrix: Builder/Architect/Reviewer/QA/Scout were validated
// in earlier experiments; PM and Librarian land here.
//
// Acceptance:
//   - PM dispatched with a freeform user-intent message produces a structured
//     translation back (no ProjectSpec mutation, just translation discipline)
//   - Librarian dispatched against a pre-populated trail produces a compaction
//     draft showing Borges + Knuth dialectic
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
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

step("Reset fixture", () => {
  rmSync(resolve(FIXTURE, ".shoshin"), { recursive: true, force: true });
});

step("shoshin init + seed spec", () => {
  const r = nodeShoshin(["init", "pm-librarian-smoke"]);
  if (r.status !== 0) fail(`init: ${r.stderr}`);
  writeFileSync(
    resolve(FIXTURE, "spec.json"),
    JSON.stringify(
      {
        name: "pm-librarian-smoke",
        oneLineGoal: "Verify PM + Librarian dispatch through the harness.",
        primaryUser: "shoshin developer",
        targetLanguages: ["en"],
        scaffoldMode: "lite",
        appShape: "cli",
        primaryStack: { lang: "go" },
        surfaces: ["cli"],
        mathPrimitives: [],
        doneInvariants: ["correct"],
      },
      null,
      2,
    ),
  );
  const r2 = nodeShoshin(["spec", "--non-interactive", "spec.json"]);
  if (r2.status !== 0) fail(`spec: ${r2.stderr}`);
});

step("Add a feature for PM/Librarian to talk about", () => {
  const r = nodeShoshin(["features", "add", "invoice-export", "--scope", "internal/invoice/"]);
  if (r.status !== 0) fail(`features add: ${r.stderr}`);
});

if (!process.env.SARVAM_API_KEY) {
  console.warn("\n(skipping live Sarvam dispatches — set SARVAM_API_KEY to enable)");
  process.exit(0);
}

// === PM dispatch ===
step("PM dispatch — translate freeform user request", () => {
  const start = Date.now();
  const r = nodeShoshin(
    [
      "dispatch",
      "pm",
      "invoice-export",
      "--brief",
      [
        "User says: \"yaar, my customers want PDF invoices in Hindi and English, ideally",
        "with our shop's WhatsApp number on the bottom, and a way for them to scan a UPI",
        "QR. Can we do that for the invoice-export feature?\"",
        "",
        "Translate this into structured ProjectSpec field changes (do NOT write code).",
        "Reflect the user's words back before structuring. Flag any constraint conflicts.",
        "End with: SPEC CHANGES PROPOSED (list) + OPEN QUESTIONS (list).",
      ].join("\n"),
      "--timeout-sec",
      "240",
    ],
    { stdio: "inherit" },
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status !== 0) fail(`pm dispatch failed after ${elapsed}s`);
  console.log(`\n  ✓ PM returned in ${elapsed}s`);
});

// === Pre-populate the trail with some activity for Librarian to compact ===
step("Pre-populate trail with simulated activity", () => {
  const trail = resolve(FIXTURE, ".shoshin", "trail.jsonl");
  const now = new Date();
  const tsBase = now.getTime() - 3600_000;
  const records = [
    { ts: new Date(tsBase + 0).toISOString(), kind: "morning_plan", ticketCount: 3 },
    {
      ts: new Date(tsBase + 60_000).toISOString(),
      kind: "subagent_spawn",
      role: "scout",
      task: "Survey current PDF generation libraries in Go ecosystem",
      envelope: ["ReadCap", "GrepCap", "WebSearchCap"],
    },
    {
      ts: new Date(tsBase + 240_000).toISOString(),
      kind: "subagent_complete",
      role: "scout",
      durationMs: 6512,
      outputDigest: "Found gofpdf and unidoc; gofpdf is OSS, unidoc commercial.",
    },
    {
      ts: new Date(tsBase + 300_000).toISOString(),
      kind: "subagent_spawn",
      role: "builder",
      task: "Implement invoice PDF Hindi+English with UPI QR",
      envelope: ["ReadCap", "WriteCap", "EditCap", "BashCap"],
    },
    {
      ts: new Date(tsBase + 720_000).toISOString(),
      kind: "subagent_complete",
      role: "builder",
      durationMs: 31204,
      outputDigest: "Implemented internal/invoice/pdf.go; QR via skip2/go-qrcode.",
    },
    {
      ts: new Date(tsBase + 780_000).toISOString(),
      kind: "feature_advance",
      feature: "invoice-export",
      from: "SCAFFOLDED",
      to: "MODEL_DONE",
      evidence: "PDF generates with Hindi+English; UPI QR scans correctly",
    },
    {
      ts: new Date(tsBase + 1_800_000).toISOString(),
      kind: "subagent_spawn",
      role: "qa",
      task: "Verify invoice PDF end-to-end with edge cases",
      envelope: ["ReadCap", "BashCap", "TestCap"],
    },
    {
      ts: new Date(tsBase + 1_900_000).toISOString(),
      kind: "subagent_complete",
      role: "qa",
      durationMs: 8732,
      outputDigest: "Happy path passes; long names truncate gracefully; needs tests for special Devanagari chars",
    },
  ];
  for (const r of records) {
    appendFileSync(trail, JSON.stringify(r) + "\n");
  }
  return `  ${records.length} simulated records appended`;
});

// === Librarian dispatch ===
step("Librarian dispatch — compact recent trail into a memory entry", () => {
  const start = Date.now();
  const r = nodeShoshin(
    [
      "dispatch",
      "librarian",
      "invoice-export",
      "--brief",
      [
        "Read .shoshin/trail.jsonl (the project's stigmergy log).",
        "Compact the most recent activity related to the invoice-export feature into a",
        "single MEMORY.md candidate entry.",
        "",
        "Discipline:",
        "- Pointers + key observations, not narrative.",
        "- Surface contradictions (if any) before adding.",
        "- Distill to the minimum that preserves future recall.",
        "- Use canonical names; prefer discoverability over novelty.",
        "",
        "End with the candidate entry as a markdown block ready to append.",
      ].join("\n"),
      "--timeout-sec",
      "240",
    ],
    { stdio: "inherit" },
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status !== 0) fail(`librarian dispatch failed after ${elapsed}s`);
  console.log(`\n  ✓ Librarian returned in ${elapsed}s`);
});

step("Verify trail has PM + Librarian spawn records", () => {
  const r = nodeShoshin(["trail", "tail", "-n", "30"]);
  if (r.status !== 0) fail(`trail failed`);
  if (!/subagent_spawn\s+pm:/i.test(r.stdout)) fail(`PM spawn missing in trail`);
  if (!/subagent_spawn\s+librarian:/i.test(r.stdout)) fail(`Librarian spawn missing in trail`);
  return r.stdout.split("\n").slice(-12).join("\n");
});

console.log("\n══════════════════════════════════════════");
console.log("  PM + LIBRARIAN SMOKE: PASSED");
console.log("  All 7 roles now operationally validated.");
console.log("══════════════════════════════════════════\n");
