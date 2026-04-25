// Experiment 017 - dogfood a real user-to-dev loop with a one-file SPA.
//
// This is the first product-shaped acceptance test: Shoshin receives a small app
// request, dispatches Architect -> Builder, and leaves an artifact a human can try.
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

function nodeShoshin(args, opts = {}) {
  return spawnSync(process.execPath, [SHOSHIN_BIN, ...args], {
    cwd: opts.cwd ?? FIXTURE,
    encoding: "utf8",
    env: { ...process.env, SARVAM_PI_ROOT },
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 420_000,
  });
}

function step(label, fn) {
  process.stdout.write(`\n> ${label}\n`);
  const out = fn();
  if (out !== undefined) process.stdout.write(`${out}\n`);
}

function fail(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

step("Reset fixture", () => {
  rmSync(FIXTURE, { recursive: true, force: true });
  mkdirSync(FIXTURE, { recursive: true });
});

step("shoshin init + spec", () => {
  const init = nodeShoshin(["init", "kirana-spa-dogfood"]);
  if (init.status !== 0) fail(`init failed:\n${init.stderr}`);

  const specPath = resolve(FIXTURE, "spec.json");
  writeFileSync(
    specPath,
    JSON.stringify(
      {
        name: "kirana-spa-dogfood",
        oneLineGoal:
          "Single-file mobile-friendly kirana expense tracker that works offline in the browser.",
        primaryUser: "Kirana shopkeeper tracking daily purchases and totals",
        targetLanguages: ["en"],
        scaffoldMode: "lite",
        appShape: "web",
        primaryStack: { lang: "html", framework: "vanilla" },
        surfaces: ["pwa"],
        storage: "filesystem",
        mathPrimitives: [],
        doneInvariants: ["correct", "accessible", "observable", "tested"],
        notes:
          "Dogfood task: create exactly one index.html with embedded CSS and JS. No build step, no external CDN dependencies.",
        source: "manual",
      },
      null,
      2,
    ),
    "utf8",
  );
  const spec = nodeShoshin(["spec", "--non-interactive", "spec.json"]);
  if (spec.status !== 0) fail(`spec import failed:\n${spec.stderr}\n${spec.stdout}`);
  return "  spec imported";
});

step("Add and scaffold feature", () => {
  const add = nodeShoshin([
    "features",
    "add",
    "kirana-expense-spa",
    "--scope",
    "app/",
  ]);
  if (add.status !== 0) fail(`feature add failed:\n${add.stderr}`);
  mkdirSync(resolve(FIXTURE, "app"), { recursive: true });
  const advance = nodeShoshin(["features", "advance", "kirana-expense-spa"]);
  if (advance.status !== 0) fail(`advance to SCAFFOLDED failed:\n${advance.stderr}`);
  return "  feature is SCAFFOLDED";
});

if (!process.env.SARVAM_API_KEY) {
  console.warn("\n(skipping live Builder run - set SARVAM_API_KEY to dogfood the agent)");
  console.log("\nSPA DEV LOOP SMOKE: PASSED (setup only)\n");
  process.exit(0);
}

step("Architect -> Builder creates the one-file SPA", () => {
  const brief = [
    "Build a single-file HTML SPA for a kirana shopkeeper.",
    "",
    "Artifact:",
    "- Create app/index.html only.",
    "- Use embedded CSS and embedded JavaScript.",
    "- Do not use external CDNs, packages, or build tools.",
    "",
    "Required behavior:",
    "- Form fields for item name, quantity, unit price, and optional note.",
    "- Add item to a visible list/table.",
    "- Calculate line totals and a grand total in rupees.",
    "- Persist items to localStorage and restore them on page load.",
    "- Provide delete item and clear all actions.",
    "- Include an empty state.",
    "- Work well on mobile width.",
    "",
    "Verification:",
    "- Read app/index.html after writing it.",
    "- Confirm it contains localStorage usage and an add-item event handler.",
    "- Final response must list changed files and the exact verification check.",
  ].join("\n");

  const started = Date.now();
  const run = nodeShoshin(
    [
      "dispatch",
      "builder",
      "kirana-expense-spa",
      "--brief",
      brief,
      "--advance-to",
      "MODEL_DONE",
      "--timeout-sec",
      "360",
    ],
    { stdio: "inherit", timeout: 480_000 },
  );
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (run.status !== 0) fail(`builder dispatch failed after ${elapsed}s`);
  return `  Builder returned in ${elapsed}s`;
});

step("Verify generated SPA artifact", () => {
  const target = resolve(FIXTURE, "app", "index.html");
  if (!existsSync(target)) fail(`expected artifact missing: ${target}`);
  const html = readFileSync(target, "utf8");
  const checks = [
    ["html shell", /<!doctype html|<html/i],
    ["mobile viewport", /viewport/i],
    ["form", /<form|input/i],
    ["localStorage", /localStorage/],
    ["rupee total", /₹|Rs\.?|INR|rupee/i],
    ["delete action", /delete|remove/i],
    ["clear action", /clear/i],
    ["script", /<script/i],
    ["style", /<style/i],
  ];
  const missing = checks.filter(([, pattern]) => !pattern.test(html)).map(([name]) => name);
  if (missing.length) fail(`index.html missing checks: ${missing.join(", ")}`);
  return `  ${target}\n  ${html.length} bytes`;
});

step("Trail and session evidence", () => {
  const trailPath = resolve(FIXTURE, ".shoshin", "trail.jsonl");
  const records = readFileSync(trailPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const kinds = new Set(records.map((r) => r.kind));
  for (const required of [
    "subagent_spawn",
    "subagent_complete",
    "session_summary",
    "mutation_gate",
    "feature_advance",
  ]) {
    if (!kinds.has(required)) fail(`trail missing ${required}`);
  }
  const featurePath = resolve(FIXTURE, ".shoshin", "features.json");
  const features = JSON.parse(readFileSync(featurePath, "utf8"));
  const feature = features.features.find((f) => f.id === "kirana-expense-spa");
  if (!feature || feature.state !== "MODEL_DONE") {
    fail(`feature did not reach MODEL_DONE: ${feature?.state ?? "(missing)"}`);
  }
  return `  ${records.length} trail records; feature=${feature.state}`;
});

console.log("\nSPA DEV LOOP SMOKE: PASSED\n");
console.log(`Open this file to dogfood manually:\n${resolve(FIXTURE, "app", "index.html")}\n`);
