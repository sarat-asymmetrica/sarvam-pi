// Experiment 013 — Host persona + Asya pillars + warm chat surface.
//
// Acceptance:
//   1. `shoshin roles list` includes the host role with Tagore+Rogers personas
//   2. `shoshin roles prompt host` produces a system prompt that includes the
//      seven Asya traits, EQ engine, and cognition engine
//   3. Without SARVAM_API_KEY: `shoshin chat` exits gracefully with a
//      helpful error (no crash, no silent failure)
//   4. With SARVAM_API_KEY: `shoshin chat <freeform question>` returns a
//      warm response that does NOT silently dispatch (must mention or imply
//      offering further help, asking a question, or naming a next step)
//   5. Trail records user_prompt + subagent_spawn(host) + subagent_complete
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
    timeout: opts.timeout ?? 240_000,
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

step("shoshin init + minimal spec", () => {
  const r = nodeShoshin(["init", "host-persona-smoke"]);
  if (r.status !== 0) fail(`init: ${r.stderr}`);
  writeFileSync(
    resolve(FIXTURE, "spec.json"),
    JSON.stringify(
      {
        name: "host-smoke",
        oneLineGoal: "Tiny demo to verify the host warmly receives users.",
        primaryUser: "kirana store owner",
        targetLanguages: ["en", "hi"],
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

step("Verify roles list includes host with Tagore+Rogers", () => {
  const r = nodeShoshin(["roles", "list"]);
  if (r.status !== 0) fail(`roles list: ${r.stderr}`);
  if (!/host\s/.test(r.stdout)) fail(`roles list missing host:\n${r.stdout}`);
  if (!/Tagore/i.test(r.stdout)) fail(`roles list missing Tagore persona`);
  if (!/Rogers/i.test(r.stdout)) fail(`roles list missing Carl Rogers persona`);
  if (!/UserTalkCap/.test(r.stdout)) fail(`host envelope missing UserTalkCap`);
  return `  ✓ host role + persona pair + envelope all present`;
});

step("Verify host system prompt includes Asya pillars", () => {
  const r = nodeShoshin(["roles", "prompt", "host"]);
  if (r.status !== 0) fail(`roles prompt host: ${r.stderr}`);
  const out = r.stdout.toLowerCase();
  for (const expect of [
    "seven traits",
    "patience",
    "eq engine",
    "user state",
    "way of water",
    "confidence",
    "cognition engine",
    "regimeshift",
    "user presence", // role-specific concern
  ]) {
    if (!out.includes(expect)) {
      fail(`host prompt missing expected pillar fragment: "${expect}"`);
    }
  }
  return `  ✓ traits + EQ + cognition + role-specific discipline all woven in`;
});

step("PM role also gets Asya light layer", () => {
  const r = nodeShoshin(["roles", "prompt", "pm"]);
  if (r.status !== 0) fail(`roles prompt pm: ${r.stderr}`);
  const out = r.stdout.toLowerCase();
  if (!out.includes("seven traits")) fail(`pm prompt missing traits layer`);
  if (!out.includes("eq engine")) fail(`pm prompt missing EQ engine layer`);
  if (out.includes("cognition engine")) {
    fail(`pm prompt should NOT include cognition engine (light layer only)`);
  }
  return `  ✓ PM gets ASYA_LIGHT (traits + EQ); cognition reserved for host`;
});

step("Builder role stays mechanical (no Asya pillars)", () => {
  const r = nodeShoshin(["roles", "prompt", "builder"]);
  if (r.status !== 0) fail(`roles prompt builder: ${r.stderr}`);
  const out = r.stdout.toLowerCase();
  if (out.includes("seven traits") || out.includes("eq engine")) {
    fail(`builder prompt should NOT include Asya pillars (stays mechanical)`);
  }
  if (!r.stdout.includes("AXIOMS")) {
    fail(`builder prompt missing axioms (regression check)`);
  }
  return `  ✓ builder stays axiom-driven; no warmth layers`;
});

step("Without API key, shoshin chat exits gracefully", () => {
  const r = nodeShoshin(["chat", "hello"], {
    env: { SARVAM_API_KEY: "" },
  });
  if (r.status !== 2) fail(`expected exit 2 without key, got ${r.status}\n${r.stderr}`);
  if (!/SARVAM_API_KEY/.test(r.stderr)) {
    fail(`expected helpful error mentioning SARVAM_API_KEY:\n${r.stderr}`);
  }
  return `  ✓ no-key exit clean (no crash, helpful message)`;
});

if (!process.env.SARVAM_API_KEY) {
  console.warn("\n(skipping live host dispatch — set SARVAM_API_KEY to enable)");
  console.log("\n══════════════════════════════════════════");
  console.log("  HOST PERSONA SMOKE: PASSED (offline assertions)");
  console.log("══════════════════════════════════════════\n");
  process.exit(0);
}

step("Live: host responds warmly to a shopkeeper question", () => {
  const start = Date.now();
  const r = nodeShoshin([
    "chat",
    "Bhai I sold 10 chai today but I'm not sure my ledger is recording the right amount in paise vs rupees, can you help?",
  ]);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (r.status !== 0) fail(`chat dispatch failed in ${elapsed}s: ${r.stderr}\n${r.stdout}`);

  const out = r.stdout;
  // Acceptance: response should be present, mention some form of help/question/clarification
  if (!/host says/i.test(out)) fail(`output missing 'host says' header`);

  // Soft signal: response should NOT contain forbidden cold patterns
  const cold = [
    /^I will (?:execute|dispatch|invoke)/m,
    /shall I proceed\?/i,
    /\bplease wait\b/i,
  ];
  for (const re of cold) {
    if (re.test(out)) {
      fail(`response contains cold-mechanical pattern (${re}):\n${out}`);
    }
  }

  // Soft signal: response should mirror, invite follow-up, or use the user's
  // own register. Any of these counts as warmth (the host can choose its move).
  const warmth = [
    /\?/,                            // asks something back — invites continuation
    /\b(?:you|you're|your)\b/i,      // second-person mirroring
    /\b(?:bhai|yaar|namaste|dhanyavad|shukriya)\b/i,  // matched-register greeting
    /\b(?:hear|understand|sounds like|i see)\b/i,     // active-listening signals
  ];
  const warmHits = warmth.filter((re) => re.test(out)).length;
  if (warmHits < 2) {
    fail(
      `response shows fewer than 2 warm-engagement signals (got ${warmHits}):\n${out}`,
    );
  }

  return `  ✓ host responded in ${elapsed}s with ${warmHits}/4 warm-engagement signals`;
});

step("Verify trail covers user_prompt + host spawn + complete", () => {
  const trail = readTrail();
  const kinds = trail.map((r) => r.kind);
  for (const need of ["user_prompt", "subagent_spawn", "subagent_complete"]) {
    if (!kinds.includes(need)) fail(`trail missing kind: ${need}`);
  }
  const hostSpawn = trail.find((r) => r.kind === "subagent_spawn" && r.role === "host");
  if (!hostSpawn) fail(`no subagent_spawn for role=host in trail`);
  return `  ✓ user_prompt + host spawn + complete recorded (${trail.length} total records)`;
});

console.log("\n══════════════════════════════════════════");
console.log("  HOST PERSONA SMOKE: PASSED");
console.log("  Asya pillars + Tagore/Rogers + warm chat all wired.");
console.log("══════════════════════════════════════════\n");
