// CLI handler for `shoshin trail [tail|filter|clear]`.
import { unlinkSync } from "node:fs";
import kleur from "kleur";
import { TrailKind, TrailRecord } from "./types.js";
import { readTrailTail, filterTrail } from "./reader.js";
import { shoshinFile } from "../util/paths.js";

interface TrailCliOptions {
  count?: string;
  feature?: string;
  role?: string;
}

export async function runTrail(action: string, opts: TrailCliOptions): Promise<void> {
  if (action === "clear") {
    try {
      unlinkSync(shoshinFile("trail"));
      console.log(kleur.green("✓ Trail cleared."));
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        console.log(kleur.gray("(trail was already empty)"));
      } else {
        throw err;
      }
    }
    return;
  }

  const n = Math.max(1, parseInt(opts.count ?? "20", 10) || 20);
  let records = readTrailTail(n);

  if (opts.feature || opts.role) {
    records = filterTrail(records, {
      feature: opts.feature,
      role: opts.role,
    });
  }

  if (records.length === 0) {
    console.log(kleur.gray("(trail empty — run any shoshin command to write the first record)"));
    return;
  }

  for (const r of records) {
    const t = r.ts.replace("T", " ").slice(0, 19);
    console.log(`${kleur.gray(t)}  ${kindColor(r.kind)(r.kind.padEnd(20))} ${oneLineDigest(r)}`);
  }
}

function kindColor(kind: TrailKind): (s: string) => string {
  switch (kind) {
    case "subagent_spawn":
      return kleur.cyan;
    case "subagent_complete":
      return kleur.green;
    case "subagent_failed":
      return kleur.red;
    case "session_summary":
      return kleur.gray;
    case "compile_gate":
      return kleur.blue;
    case "mutation_gate":
      return kleur.blue;
    case "html_static_gate":
      return kleur.blue;
    case "repair_attempt":
      return kleur.yellow;
    case "browser_check":
      return kleur.cyan;
    case "quality_block":
      return kleur.red;
    case "process_hygiene":
      return kleur.yellow;
    case "feature_advance":
      return kleur.magenta;
    case "spec_written":
      return kleur.yellow;
    case "tool_call":
      return kleur.blue;
    case "user_prompt":
      return kleur.white;
    case "memory_write":
    case "memory_compact":
      return kleur.gray;
    case "morning_plan":
    case "evening_reconvene":
      return kleur.bold;
    case "time_pulse":
      return kleur.gray;
    case "capability_revoked":
    case "capability_pause":
      return kleur.red;
  }
}

function oneLineDigest(r: TrailRecord): string {
  switch (r.kind) {
    case "spec_written":
      return `${r.name} (${r.source})`;
    case "feature_advance":
      return `${r.feature} ${r.from} → ${r.to}` + (r.evidence ? ` — ${r.evidence}` : "");
    case "subagent_spawn":
      return `${r.role}: ${r.task.slice(0, 80)}`;
    case "subagent_complete":
      return `${r.role} done in ${r.durationMs}ms`;
    case "subagent_failed":
      return `${r.role}: ${r.error.slice(0, 80)}`;
    case "session_summary":
      return `${r.role}: ${r.tokens.total} tokens in ${r.durationMs}ms`;
    case "compile_gate":
      return `${r.feature}: ${r.status} ${r.command ?? r.reason ?? ""}`.trim();
    case "mutation_gate":
      return `${r.feature}: ${r.status} ${r.changedFiles.slice(0, 3).join(", ") || r.reason}`;
    case "html_static_gate":
      return `${r.feature}: ${r.status} ${r.issueCount} issue(s)`;
    case "repair_attempt":
      return `${r.feature}: ${r.role} repair ${r.attempt}/${r.maxAttempts} - ${r.reason.slice(0, 80)}`;
    case "browser_check":
      return `${r.feature ?? "-"}: ${r.engine} ${r.status} - ${r.task.slice(0, 60)}`;
    case "quality_block":
      return `${r.feature}: ${r.gate} - ${r.reason.slice(0, 80)}`;
    case "process_hygiene":
      return `${r.action}: pid=${r.pid ?? "-"} ${r.reason}`;
    case "tool_call":
      return `${r.tool}(${r.argsDigest.slice(0, 80)})`;
    case "user_prompt":
      return r.promptDigest.slice(0, 80);
    case "memory_write":
      return `${r.file} +${r.bytesAdded}B`;
    case "memory_compact":
      return `${r.before}B → ${r.after}B`;
    case "morning_plan":
      return `${r.ticketCount} tickets`;
    case "evening_reconvene":
      return `+${r.ticketsAdvanced} advanced, ${r.ticketsBlocked} blocked`;
    case "time_pulse":
      return `${r.sessionTurns} turns | ${(r.elapsedMs / 1000).toFixed(0)}s | repo ${r.repoAgeDays ?? "?"}d | pace ${r.featurePace}`;
    case "capability_revoked":
      return `${r.role}: ${r.capability} (${r.reason})`;
    case "capability_pause":
      return `needs human: ${r.required}`;
  }
}
