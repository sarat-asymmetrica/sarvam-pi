// `shoshin run` — autonomous orchestrator loop. Dispatches queued tickets
// in order; advances features on success; logs everything to trail.
//
// Foundation phase: serial dispatch. Wave 2 will add Williams-bounded
// parallelism (using the math primitive!) and quorum mode.
import kleur from "kleur";
import { readTickets, Ticket, writeTickets } from "./tickets.js";
import { runTicket } from "../orchestrator/loop.js";
import { getFeature } from "../features/store.js";
import { setTrailSession } from "../trail/writer.js";
import { startSession } from "../time/pulse.js";

export interface RunOpts {
  maxTurns?: string;
  dryRun?: boolean;
  timeoutSec?: string;
}

export async function runRun(opts: RunOpts): Promise<void> {
  const maxTurns = parseInt(opts.maxTurns ?? "20", 10);
  const timeoutMs = Math.max(10, parseInt(opts.timeoutSec ?? "300", 10) || 300) * 1000;
  const dryRun = !!opts.dryRun;
  const cwd = process.cwd();

  const file = readTickets(cwd);
  const queued = file.tickets.filter((t) => t.status === "queued");
  if (queued.length === 0) {
    console.log(kleur.yellow("\nNo queued tickets. Run `shoshin morning` first.\n"));
    return;
  }

  startSession();
  setTrailSession(`run-${Date.now()}`);

  console.log(
    kleur.bold(
      `\n▶ Run — ${queued.length} ticket${queued.length === 1 ? "" : "s"} queued, ` +
        `maxTurns=${maxTurns}${dryRun ? ", dry-run" : ""}\n`,
    ),
  );

  let advanced = 0;
  let blocked = 0;
  let turns = 0;

  for (const ticket of queued) {
    if (turns >= maxTurns) {
      console.log(kleur.yellow(`\n  (max turns ${maxTurns} reached; remaining tickets unstarted)`));
      break;
    }
    turns++;

    console.log(
      kleur.cyan(`\n[${turns}] `) +
        kleur.bold(`${ticket.role}`) +
        kleur.gray(` on `) +
        kleur.bold(ticket.feature) +
        (ticket.proposedAdvance ? kleur.gray(` → ${ticket.proposedAdvance}`) : ""),
    );

    if (dryRun) {
      console.log(kleur.gray(`     (dry-run) ${ticket.brief.split("\n")[0]!.slice(0, 100)}`));
      continue;
    }

    const f = getFeature(ticket.feature, cwd);
    if (!f) {
      console.log(kleur.red(`     feature missing — skipped`));
      ticket.status = "blocked";
      blocked++;
      continue;
    }

    ticket.status = "in_flight";
    ticket.startedAt = new Date().toISOString();
    writeTickets(file, cwd);

    const result = await runTicket({
      role: ticket.role,
      feature: f,
      brief: ticket.brief,
      cwd,
      proposedAdvance: ticket.proposedAdvance,
      timeoutMs,
    });

    ticket.completedAt = new Date().toISOString();
    ticket.durationMs = result.dispatch.durationMs;
    ticket.outputDigest = result.dispatch.output.slice(0, 200);

    if (result.dispatch.ok) {
      ticket.status = "completed";
      if (result.advanced) {
        advanced++;
        console.log(
          kleur.green(`     ✓ ${result.dispatch.durationMs}ms`) +
            kleur.gray(` — advanced to ${result.newState}`),
        );
      } else {
        console.log(kleur.green(`     ✓ ${result.dispatch.durationMs}ms (no advance)`));
      }
    } else {
      ticket.status = "blocked";
      blocked++;
      console.log(
        kleur.red(`     ✗ ${result.dispatch.error?.slice(0, 100) ?? "failed"}`),
      );
    }
    writeTickets(file, cwd);
  }

  console.log(
    kleur.bold(
      `\n══════════════════════════════════════════\n` +
        `  Run complete: ${turns} dispatched | ${advanced} advanced | ${blocked} blocked\n` +
        `══════════════════════════════════════════\n`,
    ),
  );
}
