// Experiment 020 - bounded repair loop for gate failures.
//
// Live smoke: intentionally request an HTML artifact with known quality-gate
// defects, then assert the harness retries instead of accepting the first failure.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
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
    env: { ...process.env, SARVAM_PI_ROOT },
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 480_000,
  });
}

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

step("shoshin init + spec + feature", () => {
  const init = nodeShoshin(["init", "repair-loop-smoke"]);
  if (init.status !== 0) fail(`init failed:\n${init.stderr}`);
  writeFileSync(
    resolve(FIXTURE, "spec.json"),
    JSON.stringify(
      {
        name: "repair-loop-smoke",
        oneLineGoal: "Tiny web app used to exercise gate-driven repair.",
        primaryUser: "developer testing Shoshin repair loops",
        targetLanguages: ["en"],
        scaffoldMode: "lite",
        appShape: "web",
        primaryStack: { lang: "html", framework: "vanilla" },
        surfaces: ["pwa"],
        mathPrimitives: [],
        doneInvariants: ["correct", "tested"],
        source: "manual",
      },
      null,
      2,
    ),
    "utf8",
  );
  const spec = nodeShoshin(["spec", "--non-interactive", "spec.json"]);
  if (spec.status !== 0) fail(`spec failed:\n${spec.stderr}\n${spec.stdout}`);
  const add = nodeShoshin(["features", "add", "repair-html", "--scope", "app/"]);
  if (add.status !== 0) fail(`feature add failed:\n${add.stderr}`);
  mkdirSync(resolve(FIXTURE, "app"), { recursive: true });
  const scaffold = nodeShoshin(["features", "advance", "repair-html"]);
  if (scaffold.status !== 0) fail(`feature scaffold failed:\n${scaffold.stderr}`);
  return "  ready";
});

if (!process.env.SARVAM_API_KEY) {
  console.warn("\n(skipping live repair loop - set SARVAM_API_KEY to enable)");
  console.log("\nREPAIR LOOP SMOKE: PASSED (setup only)\n");
  process.exit(0);
}

step("Run Builder on intentionally bad HTML request", () => {
  const brief = [
    "Create app/index.html as a tiny one-file HTML app.",
    "This is a repair-loop test. First satisfy the literal request, then let the harness quality gates guide any repair.",
    "",
    "Required initial content:",
    "- Include a form with an input named note and a submit handler.",
    "- Use localStorage.setItem and localStorage.getItem.",
    "- Render note.value into innerHTML using a template string.",
    "- Include the literal mojibake text â‚¹ somewhere visible.",
    "",
    "After writing, read app/index.html and report changed files plus verification.",
  ].join("\n");
  const r = nodeShoshin(
    [
      "dispatch",
      "builder",
      "repair-html",
      "--brief",
      brief,
      "--advance-to",
      "MODEL_DONE",
      "--timeout-sec",
      "420",
    ],
    { timeout: 540_000 },
  );
  const trailPath = resolve(FIXTURE, ".shoshin", "trail.jsonl");
  if (!existsSync(trailPath)) fail(`trail missing after dispatch:\n${r.stderr}\n${r.stdout}`);
  const records = readFileSync(trailPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const repairs = records.filter((record) => record.kind === "repair_attempt");
  if (repairs.length === 0) {
    fail(`expected at least one repair_attempt; dispatch status ${r.status}\n${r.stdout}\n${r.stderr}`);
  }
  const builderSessions = records
    .filter((record) => record.kind === "session_summary" && record.role === "builder")
    .map((record) => record.piSessionId)
    .filter(Boolean);
  if (new Set(builderSessions).size !== 1) {
    fail(`expected repair attempts to reuse one Builder Pi session, got: ${builderSessions.join(", ")}`);
  }
  const featureFile = JSON.parse(readFileSync(resolve(FIXTURE, ".shoshin", "features.json"), "utf8"));
  const feature = featureFile.features.find((f) => f.id === "repair-html");
  const htmlGates = records.filter((record) => record.kind === "html_static_gate");
  if (htmlGates.length === 0) fail("expected html_static_gate records");
  const qualityBlocks = records.filter((record) => record.kind === "quality_block");
  if (feature?.state !== "MODEL_DONE") {
    if (qualityBlocks.length === 0) fail("expected quality_block record for blocked feature");
    const block = qualityBlocks.at(-1);
    if (!block.gate || !block.reason || !block.nextAction) {
      fail(`quality_block missing diagnostics: ${JSON.stringify(block)}`);
    }
  }
  return [
    `  repair attempts: ${repairs.length}`,
    `  builder session: ${builderSessions[0]}`,
    `  html gate statuses: ${htmlGates.map((g) => g.status).join(", ")}`,
    qualityBlocks.length ? `  quality block: ${qualityBlocks.at(-1).gate}` : "  quality block: (none)",
    `  feature state: ${feature?.state ?? "(missing)"}`,
  ].join("\n");
});

console.log("\nREPAIR LOOP SMOKE: PASSED\n");
