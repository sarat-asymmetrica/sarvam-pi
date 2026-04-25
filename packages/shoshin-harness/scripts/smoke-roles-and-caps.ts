// Smoke script: print Builder system prompt + envelope translation. Verifies that
// Phase 5 (roles) and Phase 6 (capabilities) compose correctly.
import { buildSystemPrompt } from "../src/roles/prompt-builder.js";
import { envelopeForRole } from "../src/capabilities/role-envelopes.js";
import { envelopeSummary, toPiPlan } from "../src/capabilities/to-pi-tools.js";
import { pauseMessage } from "../src/capabilities/never-mint.js";

const cwd = process.cwd();

const env = envelopeForRole("builder", {
  scopePath: "internal/say_hello/",
  cwd,
});

console.log("=== Builder envelope (runtime) ===");
console.log(envelopeSummary(env));

console.log("\n=== Pi tool plan ===");
const plan = toPiPlan(env);
console.log(`--tools ${plan.toolsArg}`);
console.log(`env: ${JSON.stringify(plan.envOverrides, null, 2)}`);

console.log("\n=== Sample pause message (main_branch_push) ===");
console.log(pauseMessage("main_branch_push"));

console.log("\n=== Builder system prompt (head 30 lines) ===");
const prompt = buildSystemPrompt({
  role: "builder",
  scopePath: "internal/say_hello/",
  ticketBrief: "Implement Sayer.Greet(name) returning 'Namaste, ${name}!'.",
  timePulse: "session: 0 turns | elapsed: 0s | repo age: 0d | pace: 0/hr",
});
console.log(prompt.split("\n").slice(0, 30).join("\n"));
console.log(`\n[... ${prompt.split("\n").length - 30} more lines ...]`);
