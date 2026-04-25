// Shoshin CLI entry. Each subcommand routes to a thin handler in the matching domain module.
// Add subcommands here only; logic lives in src/<domain>/cli.ts.
import { Command } from "commander";
import kleur from "kleur";

import { runInit } from "./rhythm/init.js";
import { runSpec } from "./spec/cli.js";
import { runFeatures } from "./features/cli.js";
import { runMorning, runEvening, runRun } from "./rhythm/cli.js";
import { runTrail } from "./trail/cli.js";
import { runRoles } from "./roles/cli.js";
import { runDispatch } from "./orchestrator/cli.js";
import { runScaffoldMath } from "./templates/cli.js";

const program = new Command();

program
  .name("shoshin")
  .description(
    kleur.cyan("Shoshin") +
      " — vibe-coder AI coding harness on Sarvam 105B.\n" +
      "  Plan → autonomous run → reconvene. 7 roles, persona pairs, stigmergy trail.",
  )
  .version("0.1.0-foundation");

program
  .command("init [name]")
  .description("Initialize a new Shoshin project (creates .shoshin/ and stub files).")
  .action(async (name?: string) => {
    await runInit(name);
  });

program
  .command("spec")
  .description("Run the discovery interview and write .shoshin/spec.json.")
  .option("--non-interactive <file>", "Write a pre-filled spec from a JSON file (skips interview).")
  .action(async (opts) => {
    await runSpec(opts);
  });

program
  .command("features <action> [name]")
  .description(
    "Manage the Feature Done Contract state machine. Actions: list | add | status | advance.",
  )
  .option("--state <state>", "(advance) target state name")
  .option("--evidence <text>", "(advance) evidence text appended to trail")
  .option("--scope <path>", "(add) feature scope path under which Builder may write")
  .action(async (action: string, name: string | undefined, opts) => {
    await runFeatures(action, name, opts);
  });

program
  .command("trail [action]")
  .description("Inspect the stigmergy trail. Actions: tail | filter | clear (default tail).")
  .option("-n, --count <n>", "tail count (default 20)", "20")
  .option("--feature <name>", "filter by feature name")
  .option("--role <role>", "filter by role")
  .action(async (action: string | undefined, opts) => {
    await runTrail(action ?? "tail", opts);
  });

program
  .command("roles [action]")
  .description("Inspect role catalog. Actions: list | show <role> | prompt <role> (default list).")
  .argument("[name]", "role name (for show / prompt)")
  .action(async (action: string | undefined, name: string | undefined) => {
    await runRoles(action ?? "list", name);
  });

program
  .command("scaffold-math")
  .description("Copy math primitives selected from ProjectSpec into <app>/internal/math/.")
  .option("--dry-run", "show selection without writing files")
  .action(async (opts) => {
    await runScaffoldMath(opts);
  });

program
  .command("dispatch <role> [feature]")
  .description("One-shot dispatch a role subagent. Optional --advance-to to advance feature on success.")
  .option("--brief <text>", "override the default ticket brief")
  .option("--advance-to <state>", "if dispatch ok, advance feature to this state with output as evidence")
  .option("--timeout-sec <n>", "subagent timeout in seconds (default 240)", "240")
  .action(async (role: string | undefined, feature: string | undefined, opts) => {
    await runDispatch(role, feature, opts);
  });

program
  .command("morning")
  .description("Plan-of-day flow: generate today's tickets and brief Sarvam.")
  .action(async () => {
    await runMorning();
  });

program
  .command("run")
  .description("Autonomous run. Orchestrator dispatches role subagents until tickets exhausted.")
  .option("--max-turns <n>", "max orchestrator turns (default 20)", "20")
  .option("--timeout-sec <n>", "per-ticket subagent timeout (default 300)", "300")
  .option("--dry-run", "log dispatch decisions without spawning subagents")
  .action(async (opts) => {
    await runRun(opts);
  });

program
  .command("evening")
  .description("Reconvene flow: summarize day, propose memory updates, run Librarian compaction.")
  .option("--no-prompt", "skip interactive MEMORY.md append confirmation")
  .action(async (opts) => {
    await runEvening({ noPrompt: !opts.prompt });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(kleur.red("✗ shoshin error:"), err instanceof Error ? err.message : err);
  if (process.env.SHOSHIN_DEBUG && err instanceof Error) {
    console.error(err.stack);
  }
  process.exit(1);
});
