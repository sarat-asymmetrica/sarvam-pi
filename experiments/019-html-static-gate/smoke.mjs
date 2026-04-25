// Experiment 019 - static HTML quality gate.
//
// Offline smoke for dogfood learnings: catch mojibake, unsafe user-text
// interpolation, and missing browser behavior before a web feature advances.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HARNESS_ROOT = resolve(__dirname, "..", "..", "packages", "shoshin-harness");
const TSX_BIN = resolve(HARNESS_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const FIXTURE = resolve(__dirname, "fixture");

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
  mkdirSync(resolve(FIXTURE, "bad"), { recursive: true });
  mkdirSync(resolve(FIXTURE, "good"), { recursive: true });
  mkdirSync(resolve(FIXTURE, "safe-alias"), { recursive: true });
});

step("Create HTML fixtures", () => {
  writeFileSync(
    resolve(FIXTURE, "bad", "index.html"),
    [
      "<!doctype html><html><body>",
      "<form id=\"f\"><input id=\"note\"><button>Add</button></form>",
      "<div id=\"out\"></div>",
      "<script>",
      "const note = document.getElementById('note');",
      "document.getElementById('f').addEventListener('submit', e => {",
      "  e.preventDefault();",
      "  localStorage.setItem('x', note.value);",
      "  document.getElementById('out').innerHTML = `â‚¹ ${note.value}`;",
      "});",
      "</script></body></html>",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    resolve(FIXTURE, "good", "index.html"),
    [
      "<!doctype html><html><body>",
      "<form id=\"f\"><input id=\"note\"><button>Add</button></form>",
      "<div id=\"out\"></div>",
      "<script>",
      "function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }",
      "const note = document.getElementById('note');",
      "document.getElementById('f').addEventListener('submit', e => {",
      "  e.preventDefault();",
      "  localStorage.setItem('x', note.value);",
      "  document.getElementById('out').innerHTML = `₹ ${escapeHtml(note.value)}`;",
      "});",
      "</script></body></html>",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(
    resolve(FIXTURE, "safe-alias", "index.html"),
    [
      "<!doctype html><html><body>",
      "<form id=\"f\"><input id=\"title\"><button>Add</button></form>",
      "<ul id=\"out\"></ul>",
      "<script>",
      "function escapeHTML(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }",
      "document.getElementById('f').addEventListener('submit', e => {",
      "  e.preventDefault();",
      "  const title = escapeHTML(document.getElementById('title').value);",
      "  localStorage.setItem('x', title);",
      "  document.getElementById('out').innerHTML = `<li>${title}</li>`;",
      "});",
      "</script></body></html>",
    ].join("\n"),
    "utf8",
  );
  return "  fixtures ready";
});

step("Run HTML gate driver", () => {
  const driver = resolve(__dirname, "html_static_gate_test.ts");
  writeFileSync(
    driver,
    [
      'import { runHtmlStaticGate } from "../../packages/shoshin-harness/src/orchestrator/html-static-gate.js";',
      `const fixture = ${JSON.stringify(FIXTURE)};`,
      'const spec = { name: "x", oneLineGoal: "x", primaryUser: "x", targetLanguages: ["en"], primaryStack: { lang: "html" }, scaffoldMode: "lite", appShape: "web", surfaces: ["pwa"], mathPrimitives: [], doneInvariants: ["correct"], source: "manual" } as const;',
      'const bad = runHtmlStaticGate(fixture, "bad", spec);',
      'if (bad.ok) throw new Error(`expected bad fixture to fail: ${JSON.stringify(bad)}`);',
      'if (!bad.issues.some(i => i.code === "mojibake")) throw new Error(`expected mojibake issue: ${JSON.stringify(bad)}`);',
      'if (!bad.issues.some(i => i.code === "unsafe_template_interpolation")) throw new Error(`expected unsafe interpolation issue: ${JSON.stringify(bad)}`);',
      'const good = runHtmlStaticGate(fixture, "good", spec);',
      'if (!good.ok || good.status !== "passed") throw new Error(`expected good fixture to pass: ${JSON.stringify(good)}`);',
      'const safeAlias = runHtmlStaticGate(fixture, "safe-alias", spec);',
      'if (!safeAlias.ok || safeAlias.status !== "passed") throw new Error(`expected safe alias fixture to pass: ${JSON.stringify(safeAlias)}`);',
      'console.log(JSON.stringify({ bad: bad.issues.map(i => i.code), good: good.status, safeAlias: safeAlias.status }, null, 2));',
    ].join("\n"),
    "utf8",
  );
  const r = spawnSync(process.execPath, [TSX_BIN, driver], {
    encoding: "utf8",
    timeout: 30_000,
  });
  rmSync(driver, { force: true });
  if (r.status !== 0) fail(`HTML gate driver failed:\n${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
});

console.log("\nHTML STATIC GATE SMOKE: PASSED\n");
