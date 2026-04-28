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
import { runChat } from "./chat/cli.js";
import { runBrowserCheck } from "./browser/cli.js";
import { runReport } from "./report/cli.js";

const program = new Command();

program
  .name("shoshin")
  .description(
    kleur.cyan("Shoshin") +
      " — a local coding assistant for planning, building, checking, and repairing app work.",
  )
  .version("0.1.0-foundation");

program
  .command("init [name]")
  .description("Start a project workspace (creates .shoshin/ and starter files).")
  .action(async (name?: string) => {
    await runInit(name);
  });

program
  .command("spec")
  .description(
    "Create or import the project brief. Default: guided conversation in your language.",
  )
  .option("--non-interactive <file>", "Write a pre-filled project brief from a JSON file.")
  .option("--canned", "Use the offline 12-question English form.")
  .action(async (opts) => {
    await runSpec(opts);
  });

program
  .command("features <action> [name]")
  .description(
    "Manage tasks. Actions: list | add | status | advance.",
  )
  .option("--state <state>", "(advance) target state name")
  .option("--evidence <text>", "(advance) evidence text appended to trail")
  .option("--scope <path>", "(add) feature scope path under which Builder may write")
  .action(async (action: string, name: string | undefined, opts) => {
    await runFeatures(action, name, opts);
  });

program
  .command("trail [action]")
  .description("Inspect the activity log. Actions: tail | filter | clear (default tail).")
  .option("-n, --count <n>", "tail count (default 20)", "20")
  .option("--feature <name>", "filter by feature name")
  .option("--role <role>", "filter by role")
  .action(async (action: string | undefined, opts) => {
    await runTrail(action ?? "tail", opts);
  });

program
  .command("report <feature>")
  .description("Summarize one feature: state, sessions, gates, repairs, tokens, artifacts, and latest block.")
  .action(async (feature: string | undefined) => {
    await runReport(feature);
  });

program
  .command("roles [action]")
  .description("Inspect worker roles. Actions: list | show <role> | prompt <role> (default list).")
  .argument("[name]", "role name (for show / prompt)")
  .action(async (action: string | undefined, name: string | undefined) => {
    await runRoles(action ?? "list", name);
  });

program
  .command("scaffold-math")
  .description("Copy selected math helpers into <app>/internal/math/.")
  .option("--dry-run", "show selection without writing files")
  .action(async (opts) => {
    await runScaffoldMath(opts);
  });

program
  .command("dispatch <role> [feature]")
  .description("Ask one worker role to handle a task. Optional --advance-to updates task state on success.")
  .option("--brief <text>", "override the default ticket brief")
  .option("--advance-to <state>", "if dispatch ok, advance feature to this state with output as evidence")
  .option("--timeout-sec <n>", "worker timeout in seconds (default 240)", "240")
  .action(async (role: string | undefined, feature: string | undefined, opts) => {
    await runDispatch(role, feature, opts);
  });

program
  .command("morning")
  .description("Plan today's task queue.")
  .option(
    "--no-sarvam-briefs",
    "skip AI-written task briefs; use template briefs only",
  )
  .action(async (opts) => {
    // commander negates --no-sarvam-briefs into opts.sarvamBriefs = false
    await runMorning({ sarvamBriefs: opts.sarvamBriefs });
  });

program
  .command("run")
  .description("Run the planned task queue.")
  .option("--max-turns <n>", "max orchestrator turns (default 20)", "20")
  .option("--timeout-sec <n>", "per-task worker timeout (default 300)", "300")
  .option("--dry-run", "show task decisions without running workers")
  .action(async (opts) => {
    await runRun(opts);
  });

program
  .command("chat [question...]")
  .description(
    "Ask a project question or talk through what to build next. " +
      "Pass a question inline or run with no args to type interactively.",
  )
  .option("--timeout-sec <n>", "chat timeout in seconds (default 120)", "120")
  .action(async (questionParts: string[] | undefined, opts) => {
    const question = (questionParts ?? []).join(" ").trim() || undefined;
    await runChat({ question, timeoutSec: opts.timeoutSec });
  });

program
  .command("browser-check [task...]")
  .description("Run an optional browser check and record the result.")
  .option("--feature <name>", "task id to attach to the log event")
  .option("--timeout-sec <n>", "browser-use timeout in seconds (default 180)", "180")
  .option("--require-installed", "fail instead of skip when browser-use is not installed")
  .action(async (taskParts: string[] | undefined, opts) => {
    await runBrowserCheck(taskParts, opts);
  });

program
  .command("evening")
  .description("Review today's progress and propose memory updates.")
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
