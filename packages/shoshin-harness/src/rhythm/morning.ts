// Morning plan-of-day flow. Generates today's tickets from the open
// features and the ProjectSpec. Foundation phase: heuristic ticket
// generation (one ticket per open feature, role chosen by current state);
// future: Sarvam-driven planning that picks the *right* role + brief.
import kleur from "kleur";
import { ProjectSpec } from "../spec/types.js";
import { Feature, FEATURE_STATES, FeatureState } from "../features/types.js";
import { readSpec } from "../spec/store.js";
import { readFeatures } from "../features/store.js";
import { newTicket, Ticket, TicketsFile, writeTickets } from "./tickets.js";
import { RoleName } from "../roles/types.js";
import { Trail } from "../trail/writer.js";

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

  return { spec, tickets };
}

export async function runMorning(): Promise<void> {
  const { spec, tickets } = planMorning();

  console.log(kleur.bold(kleur.cyan(`\n☀  Morning plan — ${spec?.name ?? "(no spec)"}\n`)));
  if (spec) console.log(kleur.gray(`Goal: ${spec.oneLineGoal}\n`));

  if (tickets.length === 0) {
    console.log(kleur.gray("(no open features — `shoshin features add <name>` to seed work)"));
    return;
  }

  console.log(kleur.bold(`Generated ${tickets.length} tickets for today:`));
  for (const t of tickets) {
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
