// Orchestrator core loop. Foundation phase: a single-ticket dispatch helper that
// wires spec/feature/role/dispatch/trail together. Phase 10's morning/run/evening
// flows use this as the unit primitive.
//
// In Cluster D (post-foundation), this expands to:
//   - parallel dispatch (Williams-bounded subagent count)
//   - quorum mode for uncertain decisions
//   - revoke / shrink-scope on observed misbehavior
//   - capability_pause routing for never-minted ops
import { dispatchSubagent, DispatchResult } from "./dispatch.js";
import { readSpec } from "../spec/store.js";
import { getFeature, upsertFeature } from "../features/store.js";
import { advanceFeature } from "../features/transitions.js";
import { Feature, FeatureState } from "../features/types.js";
import { RoleName } from "../roles/types.js";
import { bumpTurn, logPulseIfDue } from "../time/pulse.js";

export interface RunTicketOptions {
  role: RoleName;
  feature: Feature;
  brief: string;
  cwd: string;
  proposedAdvance?: FeatureState; // if dispatch succeeds, advance the feature here
  timeoutMs?: number;
}

export interface RunTicketResult {
  dispatch: DispatchResult;
  advanced: boolean;
  newState?: FeatureState;
}

export async function runTicket(opts: RunTicketOptions): Promise<RunTicketResult> {
  bumpTurn();
  logPulseIfDue(3, opts.cwd);

  const spec = (() => {
    try {
      return readSpec(opts.cwd);
    } catch {
      return null;
    }
  })();

  const sessionBase = `feature-${opts.feature.id}`;
  let brief = opts.brief;

  if (opts.role === "builder") {
    const architect = await dispatchSubagent({
      role: "architect",
      ticketBrief: [
        "Plan the implementation for the Builder. Do not mutate files.",
        "",
        "Builder ticket:",
        opts.brief,
      ].join("\n"),
      scopePath: opts.feature.scopePath,
      spec,
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs,
      sessionKey: `${sessionBase}-architect`,
    });

    if (!architect.ok) {
      return { dispatch: architect, advanced: false };
    }

    brief = [
      opts.brief,
      "",
      "=== Architect plan ===",
      architect.output,
      "",
      "Use the plan as guidance, but verify against the actual files before editing.",
    ].join("\n");
  }

  const dispatch = await dispatchSubagent({
    role: opts.role,
    ticketBrief: brief,
    scopePath: opts.feature.scopePath,
    spec,
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
    sessionKey: `${sessionBase}-${opts.role}`,
  });

  let advanced = false;
  let newState: FeatureState | undefined;

  if (dispatch.ok && opts.proposedAdvance) {
    const refreshed = getFeature(opts.feature.id, opts.cwd);
    if (refreshed) {
      const result = advanceFeature(refreshed, {
        to: opts.proposedAdvance,
        evidence: dispatch.output.slice(0, 200),
        cwd: opts.cwd,
      });
      if (result.ok) {
        advanced = true;
        newState = opts.proposedAdvance;
      }
    }
  }

  return { dispatch, advanced, newState };
}

// Convenience: dispatch a Scout against a free-form question without a feature.
// Useful for "answer this from the codebase" discovery turns.
export async function runScout(
  question: string,
  cwd: string,
  timeoutMs?: number,
): Promise<DispatchResult> {
  bumpTurn();
  logPulseIfDue(3, cwd);
  const spec = (() => {
    try {
      return readSpec(cwd);
    } catch {
      return null;
    }
  })();
  return dispatchSubagent({
    role: "scout",
    ticketBrief: question,
    spec,
    cwd,
    timeoutMs,
  });
}
