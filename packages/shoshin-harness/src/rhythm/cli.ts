// Daily rhythm CLI handlers. Foundation phase: morning/evening/run are stubs that
// log trail records and print human-readable plans. Phase 10 fills in the real logic.
import kleur from "kleur";
import { readSpec } from "../spec/store.js";
import { readFeatures } from "../features/store.js";
import { logTrail, Trail } from "../trail/writer.js";

interface RunOptions {
  maxTurns?: string;
  dryRun?: boolean;
}

export async function runMorning(): Promise<void> {
  const spec = readSpec();
  if (!spec) {
    console.error(kleur.red("✗ No spec yet. Run `shoshin spec` first."));
    process.exit(2);
  }
  const features = readFeatures();
  const open = features.features.filter((f) => f.state !== "DONE");

  console.log(kleur.bold(kleur.cyan(`\n☀  Morning plan — ${spec.name}\n`)));
  console.log(`Goal: ${spec.oneLineGoal}`);
  console.log(`Open features: ${open.length}`);
  for (const f of open.slice(0, 10)) {
    console.log(`  • ${kleur.gray(f.state.padEnd(11))} ${f.id}`);
  }
  if (open.length === 0) {
    console.log(
      kleur.gray("  (no open features — `shoshin features add <name>` to seed today's work)"),
    );
  }
  console.log(
    kleur.gray("\n  Foundation note: Phase 10 will turn this into Sarvam-driven ticket gen.\n"),
  );

  Trail.morning(open.length);
}

export async function runEvening(): Promise<void> {
  const features = readFeatures();
  const advanced = features.features.filter((f) => f.history.length > 0).length;
  const blocked = features.features.filter(
    (f) => f.state === "REQUESTED" && Date.now() - new Date(f.createdAt).getTime() > 86400_000,
  ).length;

  console.log(kleur.bold(kleur.magenta("\n🌙 Evening reconvene\n")));
  console.log(`  features touched today: ${advanced}`);
  console.log(`  features blocked >24h:  ${blocked}`);
  console.log(
    kleur.gray("\n  Foundation note: Phase 10 will run Librarian compaction + memory updates.\n"),
  );

  Trail.evening(advanced, blocked);
}

export async function runRun(opts: RunOptions): Promise<void> {
  const maxTurns = parseInt(opts.maxTurns ?? "20", 10);
  const dryRun = !!opts.dryRun;

  console.log(
    kleur.bold(`\n▶ Running orchestrator (maxTurns=${maxTurns}${dryRun ? ", dry-run" : ""})\n`),
  );
  console.log(
    kleur.yellow(
      "  Foundation note: Phase 9 wires the real orchestrator loop; this is a placeholder.",
    ),
  );
  console.log(
    kleur.gray("  No subagents are dispatched yet. Use `shoshin features advance` manually.\n"),
  );

  logTrail({
    kind: "morning_plan",
    ticketCount: 0,
  });
}
