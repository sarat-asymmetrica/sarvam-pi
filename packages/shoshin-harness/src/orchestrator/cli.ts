// CLI handler for `shoshin dispatch <role> <feature> [--brief X] [--advance-to Y]`.
// One-shot role dispatch — useful for foundation-phase manual operation and for
// scripts that drive the harness from outside (e.g. cron, CI).
import kleur from "kleur";
import { runScout, runTicket } from "./loop.js";
import { getFeature } from "../features/store.js";
import { ROLE_NAMES, RoleName } from "../roles/types.js";
import { FEATURE_STATES, FeatureState, slugify } from "../features/types.js";
import { setTrailSession } from "../trail/writer.js";
import { startSession } from "../time/pulse.js";

interface DispatchCliOptions {
  brief?: string;
  advanceTo?: string;
  timeoutSec?: string;
}

export async function runDispatch(
  role: string | undefined,
  feature: string | undefined,
  opts: DispatchCliOptions,
): Promise<void> {
  if (!role) {
    console.error(kleur.red("usage: shoshin dispatch <role> [<feature>] [--brief X] [--advance-to Y]"));
    console.error(kleur.gray(`  roles: ${ROLE_NAMES.join(" | ")}`));
    process.exit(2);
  }
  if (!(ROLE_NAMES as readonly string[]).includes(role)) {
    console.error(kleur.red(`unknown role: ${role}. roles: ${ROLE_NAMES.join(" | ")}`));
    process.exit(2);
  }

  startSession();
  setTrailSession(`dispatch-${Date.now()}`);

  const timeoutMs = Math.max(10, parseInt(opts.timeoutSec ?? "240", 10) || 240) * 1000;
  const cwd = process.cwd();

  // Free-form Scout call (no feature required) — convenience for discovery turns.
  if (!feature && role === "scout") {
    if (!opts.brief) {
      console.error(kleur.red("scout dispatch without a feature requires --brief <question>"));
      process.exit(2);
    }
    console.log(kleur.cyan(`▶ scout: ${opts.brief}\n`));
    const r = await runScout(opts.brief, cwd, timeoutMs);
    console.log(kleur.bold("\n=== Response ==="));
    console.log(r.output);
    console.log(
      kleur.gray(`\n=== ok=${r.ok} | exit=${r.exitCode} | ${r.durationMs}ms ===`),
    );
    process.exit(r.ok ? 0 : 1);
  }

  if (!feature) {
    console.error(kleur.red(`role ${role} requires a feature name`));
    process.exit(2);
  }
  const f = getFeature(slugify(feature));
  if (!f) {
    console.error(kleur.red(`feature not found: ${feature}`));
    process.exit(2);
  }

  const brief = opts.brief ?? defaultBrief(role as RoleName, f.id, f.name);

  let advance: FeatureState | undefined;
  if (opts.advanceTo) {
    if (!(FEATURE_STATES as readonly string[]).includes(opts.advanceTo)) {
      console.error(kleur.red(`unknown state: ${opts.advanceTo}. states: ${FEATURE_STATES.join(" | ")}`));
      process.exit(2);
    }
    advance = opts.advanceTo as FeatureState;
  }

  console.log(kleur.cyan(`▶ ${role} on ${f.id} (${f.state})`));
  if (advance) console.log(kleur.gray(`  on success: advance to ${advance}`));
  console.log(kleur.gray(`  brief: ${brief.split("\n")[0]}`));
  console.log(kleur.gray(`  scope: ${f.scopePath ?? "(none)"}\n`));

  const r = await runTicket({
    role: role as RoleName,
    feature: f,
    brief,
    cwd,
    proposedAdvance: advance,
    timeoutMs,
  });

  console.log(kleur.bold("\n=== Response ==="));
  console.log(r.dispatch.output);
  console.log(
    kleur.gray(
      `\n=== ok=${r.dispatch.ok} | exit=${r.dispatch.exitCode} | ${r.dispatch.durationMs}ms ===`,
    ),
  );
  if (r.advanced) {
    console.log(kleur.green(`✓ Feature advanced to ${r.newState}`));
  } else if (advance) {
    console.log(kleur.yellow(`✗ Feature did NOT advance (dispatch ok=${r.dispatch.ok})`));
  }
  process.exit(r.dispatch.ok && (!advance || r.advanced) ? 0 : 1);
}

function defaultBrief(role: RoleName, featureId: string, featureName: string): string {
  switch (role) {
    case "host":
      return `Talk with the user about feature "${featureName}" (id: ${featureId}). Reflect intent and route to a specialist if action is needed.`;
    case "scout":
      return `Reconnaissance for feature "${featureName}" (id: ${featureId}). Identify relevant files, prior art, and open questions. Stop when you have enough context to brief a Builder.`;
    case "architect":
      return `Propose the structural shape of feature "${featureName}". State the current shape, name the invariant any change must preserve, propose at most three structural moves, end with a STRONG/WEAK/NEEDS-INPUT recommendation.`;
    case "builder":
      return `Implement feature "${featureName}". Stay strictly inside the scope path. Follow the axioms; verify with a test or runtime check; end with the ELEGANCE_CHECK ritual as plain prose.`;
    case "reviewer":
      return `Review the current state of feature "${featureName}". Walk hunk by hunk if a diff exists. For each finding, label CRITICAL / IMPORTANT / NIT. End with SAFE-TO-MERGE / NEEDS-CHANGES / NEEDS-REWORK.`;
    case "qa":
      return `Verify feature "${featureName}" end-to-end. State the verification claim. Test happy path then edge cases. Record exact commands and exact outputs. Propose VERIFIED with evidence text or name the specific failure case.`;
    case "pm":
      return `Translate the user's intent for "${featureName}" into ProjectSpec / feature ticket fields. Reflect back before structuring; flag constraint conflicts.`;
    case "librarian":
      return `Compact recent activity related to "${featureName}" into a memory entry. Distill to minimum. Surface contradictions before adding.`;
  }
}
