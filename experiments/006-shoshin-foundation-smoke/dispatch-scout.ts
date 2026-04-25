// Spawn-and-dispatch helper invoked from smoke.mjs. Loads Shoshin orchestrator
// in-process and dispatches a Scout. Sees stdout from Sarvam.
import { runScout } from "../../packages/shoshin-harness/src/orchestrator/loop.js";
import { startSession } from "../../packages/shoshin-harness/src/time/pulse.js";
import { setTrailSession } from "../../packages/shoshin-harness/src/trail/writer.js";

startSession();
setTrailSession(`smoke-${Date.now()}`);

const cwd = process.cwd();

const question = [
  "You are a Scout subagent. Your task:",
  "  1. Read sample-spec.json in the current directory.",
  "  2. Report the project name and primary stack in ONE sentence.",
  "  3. Stop after that one sentence; do not ask follow-up questions.",
].join("\n");

async function main() {
  console.log(`[smoke] Dispatching Scout against fixture cwd=${cwd}`);
  console.log(`[smoke] Question:\n${question}\n`);

  const result = await runScout(question, cwd, 240_000);

  console.log("\n=== Scout response ===");
  console.log(result.output);
  console.log(
    `\n=== Result: ok=${result.ok} | exit=${result.exitCode} | duration=${result.durationMs}ms ===`,
  );

  if (!result.ok) {
    console.error(`[smoke] Scout dispatch failed: ${result.error ?? "unknown"}`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] dispatch-scout fatal:", err);
  process.exit(1);
});
