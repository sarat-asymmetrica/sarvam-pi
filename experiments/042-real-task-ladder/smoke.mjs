// Experiment 042 - real task ladder manifest.
//
// The reliability suite should grow from a checked ladder, not ad hoc dogfood
// prompts. This smoke validates the machine-readable ladder and linked smokes.
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");
const LADDER = resolve(__dirname, "task-ladder.json");

const ladder = JSON.parse(readFileSync(LADDER, "utf8"));
assert.equal(ladder.version, 1);
assert.ok(Array.isArray(ladder.rungs), "rungs must be an array");
assert.ok(ladder.rungs.length >= 8, "expected at least 8 ladder rungs");

const ids = new Set();
let activeCount = 0;
for (const rung of ladder.rungs) {
  assert.match(rung.id, /^L\d+$/, `bad rung id: ${rung.id}`);
  assert.ok(!ids.has(rung.id), `duplicate rung id: ${rung.id}`);
  ids.add(rung.id);
  for (const field of ["name", "status", "userRequest", "artifactScope", "successSignal"]) {
    assert.equal(typeof rung[field], "string", `${rung.id} missing ${field}`);
    assert.ok(rung[field].trim().length > 0, `${rung.id} empty ${field}`);
  }
  assert.ok(["active", "planned", "stable"].includes(rung.status), `${rung.id} bad status`);
  assert.ok(Array.isArray(rung.expectedArtifacts), `${rung.id} expectedArtifacts must be array`);
  assert.ok(Array.isArray(rung.primaryGates), `${rung.id} primaryGates must be array`);
  assert.ok(rung.primaryGates.length > 0, `${rung.id} needs gates`);
  if (rung.status === "active") activeCount += 1;
  if (rung.smoke) {
    assert.ok(existsSync(resolve(ROOT, rung.smoke)), `${rung.id} smoke missing: ${rung.smoke}`);
  }
}

assert.ok(activeCount >= 3, "expected at least three active rungs");
assert.ok(ladder.rungs.some((r) => r.primaryGates.includes("browser_check")), "expected browser rung");
assert.ok(ladder.rungs.some((r) => r.primaryGates.includes("compile_gate")), "expected compile rung");
assert.ok(ladder.rungs.some((r) => r.primaryGates.includes("quality_block")), "expected blocked-result rung");

console.log("042 real task ladder smoke passed");
