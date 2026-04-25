// Experiment 022 - deterministic browser behavior gate.
//
// Offline smoke for SPA behavior: Playwright opens a local index.html, adds an
// item, checks total calculation, reloads, and checks localStorage persistence.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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
  mkdirSync(resolve(FIXTURE, "good"), { recursive: true });
  mkdirSync(resolve(FIXTURE, "bad"), { recursive: true });
});

step("Create SPA fixtures", () => {
  writeFileSync(resolve(FIXTURE, "good", "index.html"), goodHtml(), "utf8");
  writeFileSync(resolve(FIXTURE, "bad", "index.html"), badHtml(), "utf8");
  return "  fixtures ready";
});

step("Run behavior gate driver", () => {
  const driver = resolve(__dirname, "browser_behavior_gate_test.ts");
  writeFileSync(
    driver,
    [
      'import { runHtmlBehaviorGate } from "../../packages/shoshin-harness/src/orchestrator/html-behavior-gate.js";',
      `const fixture = ${JSON.stringify(FIXTURE)};`,
      'const spec = { name: "x", oneLineGoal: "x", primaryUser: "x", targetLanguages: ["en"], primaryStack: { lang: "html" }, scaffoldMode: "lite", appShape: "web", surfaces: ["pwa"], mathPrimitives: [], doneInvariants: ["correct"], source: "manual" } as const;',
      'const good = runHtmlBehaviorGate(fixture, "good", spec);',
      'if (!good.ok || good.status !== "passed") throw new Error(`expected good pass: ${JSON.stringify(good)}`);',
      'const bad = runHtmlBehaviorGate(fixture, "bad", spec);',
      'if (bad.ok || bad.status !== "failed") throw new Error(`expected bad fail: ${JSON.stringify(bad)}`);',
      'console.log(JSON.stringify({ good: good.output, bad: bad.reason }, null, 2));',
    ].join("\n"),
    "utf8",
  );
  const r = spawnSync(process.execPath, [TSX_BIN, driver], {
    encoding: "utf8",
    timeout: 120_000,
  });
  rmSync(driver, { force: true });
  if (r.status !== 0) fail(`behavior gate driver failed:\n${r.stderr}\n${r.stdout}`);
  return r.stdout.trim();
});

console.log("\nBROWSER BEHAVIOR GATE SMOKE: PASSED\n");

function goodHtml() {
  return `<!doctype html>
<html><body>
<h1>Kirana Expense Tracker</h1>
<form id="expenseForm">
  <input id="itemName" placeholder="Item" required>
  <input id="quantity" type="number" required>
  <input id="unitPrice" type="number" required>
  <textarea id="note"></textarea>
  <button type="submit">Add</button>
</form>
<table><tbody id="items"></tbody></table>
<div id="grandTotal">₹0.00</div>
<script>
const key = 'items';
const form = document.getElementById('expenseForm');
const items = document.getElementById('items');
const total = document.getElementById('grandTotal');
function load(){ return JSON.parse(localStorage.getItem(key) || '[]'); }
function save(rows){ localStorage.setItem(key, JSON.stringify(rows)); }
function esc(text){ const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function render(){
  const rows = load();
  items.innerHTML = rows.map(row => '<tr><td>'+esc(row.name)+'</td><td>'+row.quantity+'</td><td>'+row.price+'</td><td>'+Number(row.quantity * row.price).toFixed(2)+'</td><td>'+esc(row.note || '')+'</td></tr>').join('');
  total.textContent = '₹' + rows.reduce((sum, row) => sum + row.quantity * row.price, 0).toFixed(2);
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const rows = load();
  rows.push({
    name: document.getElementById('itemName').value,
    quantity: Number(document.getElementById('quantity').value),
    price: Number(document.getElementById('unitPrice').value),
    note: document.getElementById('note').value
  });
  save(rows);
  render();
});
render();
</script>
</body></html>`;
}

function badHtml() {
  return `<!doctype html>
<html><body>
<h1>Kirana Expense Tracker</h1>
<form id="expenseForm">
  <input id="itemName" required>
  <input id="quantity" type="number" required>
  <input id="unitPrice" type="number" required>
  <button type="submit">Add</button>
</form>
<div id="out"></div>
<script>
document.getElementById('expenseForm').addEventListener('submit', event => {
  event.preventDefault();
  localStorage.setItem('items', '[]');
  document.getElementById('out').textContent = 'Saved';
});
</script>
</body></html>`;
}
