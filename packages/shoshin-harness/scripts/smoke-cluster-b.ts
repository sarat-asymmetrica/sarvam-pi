// Cluster B smoke: verify all of Phase 5–8 compose into a working system prompt
// for a Builder subagent dispatch. No actual Sarvam call yet — just substrate
// verification.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { buildSystemPrompt } from "../src/roles/prompt-builder.js";
import { envelopeForRole } from "../src/capabilities/role-envelopes.js";
import { envelopeSummary, toPiPlan } from "../src/capabilities/to-pi-tools.js";
import { hydrateMemory } from "../src/memory/hydrate.js";
import { startSession, bumpTurn, currentPulse, pulseLine, logPulseIfDue } from "../src/time/pulse.js";
import { readSpec } from "../src/spec/store.js";
import { readTrailTail } from "../src/trail/reader.js";

const fixtureCwd = resolve(__dirname, "..", "..", "..", "experiments", "006-shoshin-foundation-smoke", "fixture");
process.chdir(fixtureCwd);

console.log(`=== Cluster B smoke (cwd=${process.cwd()}) ===\n`);

startSession();
[1, 2, 3, 4, 5].forEach(() => bumpTurn());

const spec = readSpec();
console.log(`Spec loaded: ${spec?.name ?? "(none)"}`);

const mem = hydrateMemory({ cwd: process.cwd(), spec });
console.log(`Memory bundle: ${mem.sources.length} sources | ${mem.bytesIn}B in → ${mem.bytesOut}B out (${mem.encoding})`);

const pulse = currentPulse();
const pulseTxt = pulseLine(pulse);
console.log(`Time pulse: ${pulseTxt}`);

const env = envelopeForRole("builder", {
  scopePath: "internal/say_hello/",
  cwd: process.cwd(),
});
const plan = toPiPlan(env);
console.log(`\nEnvelope (Pi mapping):`);
console.log(`  --tools ${plan.toolsArg}`);
console.log(`  env: ${JSON.stringify(plan.envOverrides)}`);

console.log(`\nEnvelope summary for prompt:`);
console.log(envelopeSummary(env));

const trailTail = readTrailTail(5)
  .map((r) => `${r.ts.slice(0, 19)} ${r.kind}`)
  .join("\n");

const prompt = buildSystemPrompt({
  role: "builder",
  spec,
  ticketBrief: "Implement Sayer.Greet(name) returning 'Namaste, ${name}!'.",
  scopePath: "internal/say_hello/",
  memoryBundle: mem.bundle,
  timePulse: pulseTxt,
  trailTail,
});

console.log(`\nFinal Builder system prompt: ${prompt.split("\n").length} lines | ${Buffer.byteLength(prompt, "utf8")}B\n`);
console.log(prompt.slice(0, 600));
console.log("\n[... full prompt elided ...]\n");

logPulseIfDue(3);
console.log("\n[trail tail after pulse log]");
for (const r of readTrailTail(5)) {
  console.log(`  ${r.ts.slice(0, 19)}  ${r.kind}`);
}
