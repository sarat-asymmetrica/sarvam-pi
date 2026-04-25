// Feature Done Contract state transitions + evidence requirements.
//
// Each transition fires only if the evidence matches the contract. The contract is
// intentionally lightweight at the foundation phase — automated scaffold/test detection
// is post-foundation. Right now we accept user/agent-supplied evidence text and enforce
// state ordering.
//
// See docs/FEATURE_DONE_CONTRACT.md.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Feature, FEATURE_STATES, FeatureState, nextStateOf } from "./types.js";
import { upsertFeature } from "./store.js";
import { logTrail } from "../trail/writer.js";

export interface AdvanceOptions {
  to?: FeatureState; // default: next state
  evidence?: string;
  scopePath?: string;
  cwd?: string;
}

export interface AdvanceResult {
  ok: boolean;
  feature: Feature;
  reason?: string;
}

// Foundation-phase evidence checks. Each state has a *required minimum* the transition
// looks for; agents/users can attach more in the trail. Treat these as soft gates that
// will harden as the harness matures.
function evidenceOk(
  feature: Feature,
  to: FeatureState,
  evidence: string | undefined,
  cwd: string,
): { ok: boolean; reason?: string } {
  if (to === "SCAFFOLDED") {
    if (!feature.scopePath) {
      return { ok: false, reason: "SCAFFOLDED requires scopePath set on feature" };
    }
    const dir = join(cwd, feature.scopePath);
    if (!existsSync(dir)) {
      return {
        ok: false,
        reason: `SCAFFOLDED requires the scope directory to exist: ${feature.scopePath}`,
      };
    }
    return { ok: true };
  }
  if (to === "MODEL_DONE" || to === "VM_DONE" || to === "VIEW_DONE") {
    if (!evidence || evidence.trim().length < 8) {
      return {
        ok: false,
        reason: `${to} requires evidence text (>=8 chars) describing what file/symbol was completed`,
      };
    }
    return { ok: true };
  }
  if (to === "WIRED") {
    if (!evidence) {
      return {
        ok: false,
        reason: "WIRED requires evidence (e.g. wiring file path or successful boot log)",
      };
    }
    return { ok: true };
  }
  if (to === "VERIFIED") {
    if (!evidence || !/test|verified|run|pass/i.test(evidence)) {
      return {
        ok: false,
        reason:
          "VERIFIED requires evidence mentioning a test/run/verification (e.g. 'tests pass', 'manual run ok')",
      };
    }
    return { ok: true };
  }
  if (to === "DONE") {
    return { ok: true }; // user signs off; final state.
  }
  return { ok: true };
}

export function advanceFeature(feature: Feature, opts: AdvanceOptions = {}): AdvanceResult {
  const cwd = opts.cwd ?? process.cwd();
  const target = opts.to ?? nextStateOf(feature.state);
  if (!target) {
    return { ok: false, feature, reason: `feature is already at terminal state ${feature.state}` };
  }
  const fromIdx = FEATURE_STATES.indexOf(feature.state);
  const toIdx = FEATURE_STATES.indexOf(target);
  if (toIdx <= fromIdx) {
    return {
      ok: false,
      feature,
      reason: `cannot move backward (${feature.state} → ${target}); use a manual JSON edit if regressing`,
    };
  }
  if (toIdx > fromIdx + 1) {
    return {
      ok: false,
      feature,
      reason: `cannot skip states (${feature.state} → ${target}); advance one at a time`,
    };
  }

  const check = evidenceOk(feature, target, opts.evidence, cwd);
  if (!check.ok) {
    return { ok: false, feature, reason: check.reason };
  }

  if (opts.scopePath && !feature.scopePath) {
    feature.scopePath = opts.scopePath;
  }

  const now = new Date().toISOString();
  feature.history.push({
    from: feature.state,
    to: target,
    at: now,
    evidence: opts.evidence,
  });
  feature.state = target;
  feature.updatedAt = now;

  upsertFeature(feature, cwd);

  logTrail({
    kind: "feature_advance",
    feature: feature.id,
    from: feature.history[feature.history.length - 1]!.from,
    to: target,
    evidence: opts.evidence ?? null,
  });

  return { ok: true, feature };
}
