// Morning plan-of-day flow. Generates today's tickets from the open
// features and the ProjectSpec. Two-pass design:
//   1. planMorning() — sync, heuristic ticket seed (template briefs)
//   2. enrichBriefsViaSarvam() — async, swap in PM-generated briefs
//
// The split keeps the offline/no-API-key path identical to before; the
// PM enrichment is opt-in (default ON when SARVAM_API_KEY is set).
import kleur from "kleur";
import { ProjectSpec } from "../spec/types.js";
import { Feature, FEATURE_STATES, FeatureState } from "../features/types.js";
import { readSpec } from "../spec/store.js";
import { readFeatures, getFeature } from "../features/store.js";
import { newTicket, Ticket, TicketsFile, writeTickets } from "./tickets.js";
import { RoleName } from "../roles/types.js";
import { Trail } from "../trail/writer.js";
import { generateBriefViaSarvam } from "./meta_brief.js";
import { readTrailTail } from "../trail/reader.js";

// Map current state → next role to dispatch + target advance state.
function nextRoleFor(state: FeatureState): { role: RoleName; advanceTo?: FeatureState } | null {
  switch (state) {
    case "REQUESTED":
      return { role: "scout", advanceTo: "SCAFFOLDED" }; // discover before scaffold
    case "SCAFFOLDED":
      return { role: "builder", advanceTo: "MODEL_DONE" };
    case "MODEL_DONE":
      return { role: "builder", advanceTo: "VM_DONE" };
    case "VM_DONE":
      return { role: "builder", advanceTo: "VIEW_DONE" };
    case "VIEW_DONE":
      return { role: "builder", advanceTo: "WIRED" };
    case "WIRED":
      return { role: "qa", advanceTo: "VERIFIED" };
    case "VERIFIED":
      return { role: "reviewer" }; // final review before user marks DONE manually
    case "DONE":
      return null;
  }
}

function briefFor(role: RoleName, feature: Feature, spec: ProjectSpec | null): string {
  const tail = spec ? `Project: ${spec.name} — ${spec.oneLineGoal}` : "";
  switch (role) {
    case "scout":
      return [
        `Discovery for feature "${feature.name}" (id: ${feature.id}).`,
        `Identify relevant files, prior art, and open questions.`,
        `Stop with enough context to brief a Builder; do not start coding.`,
        tail,
      ].filter(Boolean).join("\n");
    case "builder":
      return [
        `Implement feature "${feature.name}" (id: ${feature.id}).`,
        feature.scopePath
          ? `Stay strictly inside scope: ${feature.scopePath}`
          : `(scope not yet set — propose one before writing files)`,
        `Follow the axioms; verify with a test or runtime check.`,
        `Close with the ELEGANCE_CHECK ritual as plain prose (do not save it to a file).`,
        tail,
      ].filter(Boolean).join("\n");
    case "qa":
      return [
        `Verify feature "${feature.name}" (id: ${feature.id}) end-to-end.`,
        `State the verification claim. Test happy path, then edge cases.`,
        `Record exact commands and exact outputs. Propose VERIFIED with evidence text or name the failure.`,
        tail,
      ].filter(Boolean).join("\n");
    case "reviewer":
      return [
        `Final review of feature "${feature.name}" (id: ${feature.id}) before user marks DONE.`,
        `Walk the code. CRITICAL / IMPORTANT / NIT findings. End SAFE-TO-MERGE / NEEDS-CHANGES / NEEDS-REWORK.`,
        tail,
      ].filter(Boolean).join("\n");
    case "architect":
      return [
        `Propose structural shape for feature "${feature.name}" (id: ${feature.id}).`,
        `State current shape, name the invariant, propose ≤3 moves, end with STRONG/WEAK/NEEDS-INPUT.`,
        tail,
      ].filter(Boolean).join("\n");
    case "pm":
      return `Translate user intent for feature "${feature.name}" (id: ${feature.id}). Reflect, structure, flag conflicts.`;
    case "librarian":
      return `Compact recent activity related to "${feature.name}" into a memory entry.`;
  }
}

export interface MorningResult {
  spec: ProjectSpec | null;
  tickets: Ticket[];
  briefSource: "template" | "sarvam-mixed" | "sarvam";
  sarvamBriefStats?: {
    attempted: number;
    succeeded: number;
    failedReasons: string[];
  };
}

export function planMorning(cwd: string = process.cwd()): MorningResult {
  const spec = (() => {
    try {
      return readSpec(cwd);
    } catch {
      return null;
    }
  })();
  const features = readFeatures(cwd);

  const tickets: Ticket[] = [];
  for (const f of features.features) {
    const next = nextRoleFor(f.state);
    if (!next) continue;
    tickets.push(
      newTicket({
        role: next.role,
        feature: f.id,
        brief: briefFor(next.role, f, spec),
        proposedAdvance: next.advanceTo,
      }),
    );
  }

  const file: TicketsFile = {
    version: 1,
    date: new Date().toISOString().slice(0, 10),
    tickets,
  };
  writeTickets(file, cwd);
  Trail.morning(tickets.length);

  return { spec, tickets, briefSource: "template" };
}

// Second-pass enrichment: dispatch PM for each ticket, swap in the cleaned
// brief if PM succeeded. Always returns a result; failed tickets keep their
// template brief (no exceptions thrown).
export async function enrichBriefsViaSarvam(
  base: MorningResult,
  cwd: string = process.cwd(),
): Promise<MorningResult> {
  if (base.tickets.length === 0) return base;
  if (!process.env.SARVAM_API_KEY) {
    // Caller can decide whether to log; we just stay quiet here so smokes
    // without a key see no behavior change.
    return base;
  }

  const stats = { attempted: 0, succeeded: 0, failedReasons: [] as string[] };
  const trailTail = readTrailTail(20, cwd);

  for (const ticket of base.tickets) {
    const feature = getFeature(ticket.feature, cwd);
    if (!feature) {
      stats.failedReasons.push(`${ticket.feature}: feature not found`);
      continue;
    }

    stats.attempted++;
    const result = await generateBriefViaSarvam({
      role: ticket.role,
      feature,
      spec: base.spec,
      trailTail,
      cwd,
      timeoutMs: 90_000,
    });

    if (result.ok && result.brief) {
      ticket.brief = result.brief;
      stats.succeeded++;
    } else {
      stats.failedReasons.push(
        `${ticket.feature} (${ticket.role}): ${result.error ?? "unknown"}`,
      );
    }
  }

  // Persist the swapped briefs back to tickets.json.
  const file: TicketsFile = {
    version: 1,
    date: new Date().toISOString().slice(0, 10),
    tickets: base.tickets,
  };
  writeTickets(file, cwd);

  const briefSource: MorningResult["briefSource"] =
    stats.succeeded === 0
      ? "template"
      : stats.succeeded === stats.attempted
        ? "sarvam"
        : "sarvam-mixed";

  return {
    ...base,
    briefSource,
    sarvamBriefStats: stats,
  };
}

export interface RunMorningOpts {
  sarvamBriefs?: boolean; // default: true if SARVAM_API_KEY set, false otherwise
}

export async function runMorning(opts: RunMorningOpts = {}): Promise<void> {
  const cwd = process.cwd();
  let result = planMorning(cwd);
  const { spec, tickets } = result;

  console.log(kleur.bold(kleur.cyan(`\n☀  Morning plan — ${spec?.name ?? "(no spec)"}\n`)));
  if (spec) console.log(kleur.gray(`Goal: ${spec.oneLineGoal}\n`));

  if (tickets.length === 0) {
    console.log(kleur.gray("(no open features — `shoshin features add <name>` to seed work)"));
    return;
  }

  // Default: enrich briefs via Sarvam when a key is present, unless explicitly disabled.
  const wantSarvamBriefs = opts.sarvamBriefs ?? Boolean(process.env.SARVAM_API_KEY);

  if (wantSarvamBriefs && process.env.SARVAM_API_KEY) {
    console.log(
      kleur.gray(
        `  Generating briefs via Sarvam PM (${tickets.length} ticket${tickets.length === 1 ? "" : "s"})…`,
      ),
    );
    result = await enrichBriefsViaSarvam(result, cwd);
    const stats = result.sarvamBriefStats;
    if (stats) {
      const tag = result.briefSource === "sarvam" ? kleur.green("✓") : kleur.yellow("≈");
      console.log(
        kleur.gray(
          `  ${tag} brief gen: ${stats.succeeded}/${stats.attempted} via Sarvam` +
            (stats.failedReasons.length
              ? ` (${stats.failedReasons.length} fell back to template)`
              : ""),
        ),
      );
      if (stats.failedReasons.length && process.env.SHOSHIN_DEBUG) {
        for (const reason of stats.failedReasons) {
          console.log(kleur.gray(`    · ${reason}`));
        }
      }
    }
    console.log("");
  } else if (wantSarvamBriefs) {
    console.log(kleur.gray("  (SARVAM_API_KEY not set — using template briefs)\n"));
  }

  console.log(kleur.bold(`Generated ${result.tickets.length} tickets for today:`));
  for (const t of result.tickets) {
    const briefHead = t.brief.split("\n")[0]!.slice(0, 90);
    console.log(
      `  ${kleur.cyan(t.role.padEnd(10))} ${kleur.bold(t.feature.padEnd(20))} ` +
        kleur.gray(`→ ${t.proposedAdvance ?? "(no advance)"}`),
    );
    console.log(`     ${kleur.gray(briefHead)}`);
  }

  console.log(
    kleur.gray("\n  Tickets queued in .shoshin/tickets.json. Run `shoshin run` to dispatch them.\n"),
  );
}
