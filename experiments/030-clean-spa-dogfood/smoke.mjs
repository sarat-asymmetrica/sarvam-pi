// Experiment 030 - clean user-facing SPA dogfood.
//
// Live smoke: after the safety hardening bundles, ask Builder for a richer
// one-file app and inspect whether the normal dev loop still feels productive.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const SARVAM_PI_ROOT = resolve(__dirname, "..", "..");
const FIXTURE = resolve(__dirname, "fixture");
const SHOSHIN_BIN = resolve(HARNESS_ROOT, "bin", "shoshin.js");
let qualityBlocked = false;

function nodeShoshin(args, opts = {}) {
  return spawnSync(process.execPath, [SHOSHIN_BIN, ...args], {
    cwd: opts.cwd ?? FIXTURE,
    encoding: "utf8",
    env: { ...process.env, SARVAM_PI_ROOT },
    stdio: opts.stdio ?? ["ignore", "pipe", "pipe"],
    timeout: opts.timeout ?? 540_000,
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
  const init = nodeShoshin(["init", "study-planner-spa-dogfood"]);
  if (init.status !== 0) fail(`init failed:\n${init.stderr}`);
  writeFileSync(
    resolve(FIXTURE, "spec.json"),
    JSON.stringify(
      {
        name: "study-planner-spa-dogfood",
        oneLineGoal: "Single-file offline study planner for a bhajan group admin.",
        primaryUser: "Bhajan group admin planning practice sessions and attendance",
        targetLanguages: ["en"],
        scaffoldMode: "lite",
        appShape: "web",
        primaryStack: { lang: "html", framework: "vanilla" },
        surfaces: ["pwa"],
        mathPrimitives: [],
        doneInvariants: ["correct", "accessible", "observable", "tested"],
        notes: "Clean dogfood task after tool hygiene hardening. One index.html only.",
        source: "manual",
      },
      null,
      2,
    ),
    "utf8",
  );
  const spec = nodeShoshin(["spec", "--non-interactive", "spec.json"]);
  if (spec.status !== 0) fail(`spec failed:\n${spec.stderr}\n${spec.stdout}`);
  const add = nodeShoshin(["features", "add", "practice-planner", "--scope", "app/"]);
  if (add.status !== 0) fail(`feature add failed:\n${add.stderr}`);
  mkdirSync(resolve(FIXTURE, "app"), { recursive: true });
  const scaffold = nodeShoshin(["features", "advance", "practice-planner"]);
  if (scaffold.status !== 0) fail(`feature scaffold failed:\n${scaffold.stderr}`);
  return "  ready";
});

if (!process.env.SARVAM_API_KEY) {
  console.warn("\n(skipping live SPA dogfood - set SARVAM_API_KEY to enable)");
  console.log("\nCLEAN SPA DOGFOOD SMOKE: PASSED (setup only)\n");
  process.exit(0);
}

step("Builder creates richer one-file app", () => {
  const brief = [
    "Build a polished single-file HTML SPA for a bhajan group admin.",
    "",
    "Artifact:",
    "- Create app/index.html only.",
    "- Use embedded CSS and embedded JavaScript.",
    "- No CDN, package install, build step, server, or network access.",
    "",
    "Required behavior:",
    "- Form fields for session title, date, start time, lead singer, and attendee count.",
    "- Add a session to a visible list.",
    "- Show total sessions and total attendees.",
    "- Persist sessions to localStorage and restore them on reload.",
    "- Provide delete session and clear all actions.",
    "- Include an empty state and mobile-friendly layout.",
    "- Escape user-entered text before rendering.",
    "",
    "Verification:",
    "- Read app/index.html after writing it.",
    "- Do not start a server. Do not use curl, git, or network commands.",
    "- The harness will run static and browser behavior gates after you return.",
    "- Final response must include changed files and the exact verification check.",
  ].join("\n");

  const started = Date.now();
  const r = nodeShoshin(
    [
      "dispatch",
      "builder",
      "practice-planner",
      "--brief",
      brief,
      "--advance-to",
      "MODEL_DONE",
      "--timeout-sec",
      "420",
    ],
    { timeout: 540_000 },
  );
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (r.status !== 0) {
    const trailPath = resolve(FIXTURE, ".shoshin", "trail.jsonl");
    const trail = existsSync(trailPath) ? readFileSync(trailPath, "utf8") : "";
    const blockedByGate = /"kind":"(mutation_gate|html_static_gate|browser_check)".*"status":"failed"/s.test(trail);
    if (!blockedByGate) fail(`builder dispatch failed after ${elapsed}s:\n${r.stderr}\n${r.stdout}`);
    qualityBlocked = true;
    return `  Builder blocked by quality gate in ${elapsed}s`;
  }
  return `  Builder returned in ${elapsed}s`;
});

step("Inspect generated app", () => {
  if (qualityBlocked) return "  skipped artifact assertions because quality gate blocked advance";
  const target = resolve(FIXTURE, "app", "index.html");
  if (!existsSync(target)) fail(`missing ${target}`);
  const html = readFileSync(target, "utf8");
  const checks = [
    ["html shell", /<!doctype html|<html/i],
    ["viewport", /viewport/i],
    ["session title field", /session|title/i],
    ["date field", /type=["']date["']|date/i],
    ["attendee count", /attendee/i],
    ["localStorage", /localStorage/],
    ["delete action", /delete|remove/i],
    ["clear action", /clear/i],
    ["empty state", /empty|no sessions|nothing/i],
    ["escaping", /textContent|createElement|escapeHTML|sanitize/i],
    ["style", /<style/i],
    ["script", /<script/i],
  ];
  const missing = checks.filter(([, pattern]) => !pattern.test(html)).map(([name]) => name);
  if (missing.length) fail(`index.html missing checks: ${missing.join(", ")}`);
  return `  ${target}\n  ${html.length} bytes`;
});

step("Trail, gates, and token evidence", () => {
  const trailPath = resolve(FIXTURE, ".shoshin", "trail.jsonl");
  const records = readFileSync(trailPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const featureFile = JSON.parse(readFileSync(resolve(FIXTURE, ".shoshin", "features.json"), "utf8"));
  const feature = featureFile.features.find((f) => f.id === "practice-planner");
  const summaries = records.filter((record) => record.kind === "session_summary");
  const htmlGates = records.filter((record) => record.kind === "html_static_gate");
  const browserGates = records.filter((record) => record.kind === "browser_check" && record.task === "deterministic HTML behavior gate");
  const toolEchoSyntheses = records.filter((record) => record.kind === "process_hygiene" && record.action === "tool_echo_synthesis");
  const timeoutKills = records.filter((record) => record.kind === "process_hygiene" && record.action === "timeout_kill");
  const totalTokens = summaries.reduce((sum, record) => sum + Number(record.tokens?.total ?? 0), 0);

  if (!summaries.length) fail("expected session_summary records");
  if (!htmlGates.length) fail("expected html_static_gate records");
  if (!browserGates.length) fail("expected browser behavior gate records");
  if (timeoutKills.length) fail("unexpected timeout_kill in clean dogfood run");
  if (!qualityBlocked && feature?.state !== "MODEL_DONE") fail(`feature state ${feature?.state ?? "(missing)"}`);
  if (feature?.state === "MODEL_DONE" && /^Called tool /i.test(String(feature.evidence ?? "").trim())) {
    fail("feature advanced with tool-call echo evidence");
  }

  return [
    `  feature state: ${feature?.state ?? "(missing)"}`,
    `  trail records: ${records.length}`,
    `  session summaries: ${summaries.length}`,
    `  total tokens: ${totalTokens}`,
    `  tool echo syntheses: ${toolEchoSyntheses.length}`,
    `  html gates: ${htmlGates.map((gate) => gate.status).join(", ")}`,
    `  browser gates: ${browserGates.map((gate) => gate.status).join(", ")}`,
  ].join("\n");
});

console.log(qualityBlocked ? "\nCLEAN SPA DOGFOOD SMOKE: PASSED (quality blocked)\n" : "\nCLEAN SPA DOGFOOD SMOKE: PASSED\n");
if (!qualityBlocked) {
  console.log(`Open this file to dogfood manually:\n${resolve(FIXTURE, "app", "index.html")}\n`);
}
