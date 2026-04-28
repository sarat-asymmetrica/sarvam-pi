// Orchestrator core loop. Foundation phase: a single-ticket dispatch helper that
// wires spec/feature/role/dispatch/trail together. Phase 10's morning/run/evening
// flows use this as the unit primitive.
//
// In Cluster D (post-foundation), this expands to:
//   - parallel dispatch (Williams-bounded subagent count)
//   - quorum mode for uncertain decisions
//   - revoke / shrink-scope on observed misbehavior
//   - capability_pause routing for never-minted ops
import { dispatchSubagent, DispatchResult, isToolCallEcho, isWeakFinalAnswer } from "./dispatch.js";
import { readSpec } from "../spec/store.js";
import { getFeature, upsertFeature } from "../features/store.js";
import { advanceFeature } from "../features/transitions.js";
import { Feature, FeatureState } from "../features/types.js";
import { RoleName } from "../roles/types.js";
import { bumpTurn, logPulseIfDue } from "../time/pulse.js";
import { runCompileOrImportGate, CompileGateResult } from "./compile-gate.js";
import {
  compareMutationSnapshot,
  MutationGateResult,
  MutationSnapshot,
  snapshotScope,
} from "./mutation-gate.js";
import { runHtmlStaticGate, HtmlStaticGateResult } from "./html-static-gate.js";
import { runHtmlBehaviorGate, HtmlBehaviorGateResult } from "./html-behavior-gate.js";
import { Trail } from "../trail/writer.js";

const ARCHITECT_PLAN_PROMPT_LIMIT = 6_000;
const REPAIR_TICKET_PROMPT_LIMIT = 3_500;
const REPAIR_REASON_PROMPT_LIMIT = 2_500;
const REPAIR_CHANGE_SUMMARY_PROMPT_LIMIT = 1_500;

export interface RunTicketOptions {
  role: RoleName;
  feature: Feature;
  brief: string;
  cwd: string;
  proposedAdvance?: FeatureState; // if dispatch succeeds, advance the feature here
  timeoutMs?: number;
  maxRepairAttempts?: number;
}

export interface RunTicketResult {
  dispatch: DispatchResult;
  advanced: boolean;
  newState?: FeatureState;
  compileGate?: CompileGateResult;
  mutationGate?: MutationGateResult;
  htmlStaticGate?: HtmlStaticGateResult;
  htmlBehaviorGate?: HtmlBehaviorGateResult;
  qualityBlock?: QualityBlockSummary;
}

export interface QualityBlockSummary {
  feature: string;
  gate: string;
  reason: string;
  changedFiles: string[];
  repairAttempts: number;
  nextAction: string;
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
  let mutationSnapshot: MutationSnapshot | null = null;
  const maxRepairAttempts = Math.max(0, opts.maxRepairAttempts ?? 2);
  let repairBudget = maxRepairAttempts;
  const hardRepairBudget = shouldMutationGate(opts) ? Math.max(repairBudget, 4) : repairBudget;

  if (opts.role === "builder") {
    const architectSnapshot = snapshotScope(opts.cwd, opts.feature.scopePath);
    const architectBrief = [
      "Plan the implementation for the Builder. Do not mutate files.",
      "You are in a read-only planning pass. Use only read, grep, find, or ls if you need tools.",
      "Never call write, edit, bash, or capability names during this planning pass.",
      "",
      "Builder ticket:",
      opts.brief,
    ].join("\n");
    let architect = await dispatchSubagent({
      role: "architect",
      ticketBrief: architectBrief,
      scopePath: opts.feature.scopePath,
      spec,
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs,
      sessionKey: `${sessionBase}-architect`,
    });
    for (let attempt = 0; !architect.ok && attempt < maxRepairAttempts; attempt++) {
      const toolReason = unavailableToolFailureReport(architect);
      if (!toolReason) break;
      Trail.repairAttempt(opts.feature.id, "architect", attempt + 1, maxRepairAttempts, toolReason);
      architect = await dispatchSubagent({
        role: "architect",
        ticketBrief: repairBrief(architectBrief, toolReason, attempt + 1),
        scopePath: opts.feature.scopePath,
        spec,
        cwd: opts.cwd,
        timeoutMs: opts.timeoutMs,
        sessionKey: `${sessionBase}-architect`,
      });
    }

    if (!architect.ok) {
      return { dispatch: architect, advanced: false };
    }

    const architectMutation = compareMutationSnapshot(architectSnapshot);
    if (architectMutation.ok) {
      Trail.mutationGate(
        opts.feature.id,
        "failed",
        architectMutation.root,
        architectMutation.changedFiles,
        "Architect mutated files during read-only planning pass",
      );
      return { dispatch: architect, advanced: false, mutationGate: architectMutation };
    }

    brief = [
      opts.brief,
      "",
      "=== Architect plan ===",
      compactPromptText(architect.output, ARCHITECT_PLAN_PROMPT_LIMIT),
      "",
      "Use the plan as guidance, but verify against the actual files before editing.",
    ].join("\n");

    mutationSnapshot = shouldMutationGate(opts) ? snapshotScope(opts.cwd, opts.feature.scopePath) : null;
  }

  let advanced = false;
  let newState: FeatureState | undefined;
  let dispatch: DispatchResult | null = null;
  let lastCompileGate: CompileGateResult | undefined;
  let lastMutationGate: MutationGateResult | undefined;
  let lastHtmlStaticGate: HtmlStaticGateResult | undefined;
  let lastHtmlBehaviorGate: HtmlBehaviorGateResult | undefined;
  let repairAttemptsSpent = 0;
  let currentBrief = brief;

  // Keep the original scoped baseline across repairs. A failed attempt can still
  // create the valid artifact that a later synthesis/repair attempt reports.
  let previousBehaviorFailureSnapshot: MutationSnapshot | null = null;
  let previousBehaviorFailureSignature: string | null = null;
  let repeatedBehaviorFailureCount = 0;
  let previousAttemptSnapshot: MutationSnapshot | null = mutationSnapshot;
  for (let attempt = 0; attempt <= repairBudget; attempt++) {
    dispatch = await dispatchSubagent({
      role: opts.role,
      ticketBrief: currentBrief,
      scopePath: opts.feature.scopePath,
      spec,
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs,
      sessionKey: `${sessionBase}-${opts.role}`,
    });
    const attemptSnapshot = opts.role === "builder" ? snapshotScope(opts.cwd, opts.feature.scopePath) : null;
    const attemptChangeSummary = attemptSnapshot
      ? scopedAttemptChangeSummary(previousAttemptSnapshot, attemptSnapshot)
      : null;
    if (attemptSnapshot) previousAttemptSnapshot = attemptSnapshot;

    if (!dispatch.ok) {
      const scopeReason = scopeViolationFailureReport(dispatch, opts);
      if (scopeReason && attempt < maxRepairAttempts && opts.role === "builder") {
        repairAttemptsSpent += 1;
        Trail.repairAttempt(opts.feature.id, opts.role, attempt + 1, maxRepairAttempts, scopeReason);
        currentBrief = repairBrief(brief, scopeReason, attempt + 1, attemptChangeSummary);
        continue;
      }
      const toolReason = unavailableToolFailureReport(dispatch);
      if (toolReason && attempt < maxRepairAttempts && opts.role === "builder") {
        repairAttemptsSpent += 1;
        Trail.repairAttempt(opts.feature.id, opts.role, attempt + 1, maxRepairAttempts, toolReason);
        currentBrief = repairBrief(brief, toolReason, attempt + 1, attemptChangeSummary);
        continue;
      }
      const processReason = longLivedCommandFailureReport(dispatch);
      if (processReason && attempt < maxRepairAttempts && opts.role === "builder") {
        repairAttemptsSpent += 1;
        Trail.repairAttempt(opts.feature.id, opts.role, attempt + 1, maxRepairAttempts, processReason);
        currentBrief = repairBrief(brief, processReason, attempt + 1, attemptChangeSummary);
        continue;
      }
      if (opts.proposedAdvance) {
        const changedFiles = mutationSnapshot ? compareMutationSnapshot(mutationSnapshot).changedFiles : [];
        const qualityBlock = qualityBlockFromDispatchFailure(
          opts.feature.id,
          dispatch,
          repairAttemptsSpent,
          changedFiles,
        );
        Trail.qualityBlock(qualityBlock.feature, qualityBlock.gate, qualityBlock.reason, qualityBlock.changedFiles, qualityBlock.repairAttempts, qualityBlock.nextAction);
        return { dispatch, advanced: false, newState, qualityBlock };
      }
      return { dispatch, advanced, newState };
    }

    if (!opts.proposedAdvance) {
      return { dispatch, advanced, newState };
    }

    const refreshed = getFeature(opts.feature.id, opts.cwd);
    if (refreshed) {
      let mutationGate: MutationGateResult | undefined;
      if (mutationSnapshot) {
        mutationGate = compareMutationSnapshot(mutationSnapshot);
        if (mutationGate.ok && opts.role === "builder" && opts.proposedAdvance === "MODEL_DONE") {
          mutationGate = requireImplementationMutation(mutationGate);
        }
        lastMutationGate = mutationGate;
        Trail.mutationGate(
          refreshed.id,
          mutationGate.ok ? "passed" : "failed",
          mutationGate.root,
          mutationGate.changedFiles,
          mutationGate.reason ?? null,
        );
        if (!mutationGate.ok) {
          const reason = mutationGateFailureReport(mutationGate);
          if (attempt < maxRepairAttempts && opts.role === "builder") {
            repairAttemptsSpent += 1;
            Trail.repairAttempt(refreshed.id, opts.role, attempt + 1, maxRepairAttempts, reason);
            currentBrief = repairBrief(brief, reason, attempt + 1, attemptChangeSummary);
            continue;
          }
          const qualityBlock = qualityBlockFromGates(refreshed.id, repairAttemptsSpent, { mutationGate });
          Trail.qualityBlock(qualityBlock.feature, qualityBlock.gate, qualityBlock.reason, qualityBlock.changedFiles, qualityBlock.repairAttempts, qualityBlock.nextAction);
          return { dispatch, advanced: false, mutationGate, qualityBlock };
        }
      }
      let htmlStaticGate: HtmlStaticGateResult | undefined;
      if (opts.proposedAdvance === "MODEL_DONE") {
        htmlStaticGate = runHtmlStaticGate(opts.cwd, refreshed.scopePath, spec);
        lastHtmlStaticGate = htmlStaticGate;
        Trail.htmlStaticGate(
          refreshed.id,
          htmlStaticGate.status,
          htmlStaticGate.root,
          htmlStaticGate.filesChecked,
          htmlStaticGate.issues.map((issue) => `${issue.file}:${issue.code}:${issue.message}`),
          htmlStaticGate.reason ?? null,
        );
        if (!htmlStaticGate.ok) {
          const reason = htmlStaticGateFailureReport(htmlStaticGate);
          if (attempt < maxRepairAttempts && opts.role === "builder") {
            repairAttemptsSpent += 1;
            Trail.repairAttempt(refreshed.id, opts.role, attempt + 1, maxRepairAttempts, reason);
            currentBrief = repairBrief(brief, reason, attempt + 1, attemptChangeSummary);
            continue;
          }
          const qualityBlock = qualityBlockFromGates(refreshed.id, repairAttemptsSpent, { mutationGate, htmlStaticGate });
          Trail.qualityBlock(qualityBlock.feature, qualityBlock.gate, qualityBlock.reason, qualityBlock.changedFiles, qualityBlock.repairAttempts, qualityBlock.nextAction);
          return { dispatch, advanced: false, mutationGate, htmlStaticGate, qualityBlock };
        }
        const htmlBehaviorGate = runHtmlBehaviorGate(opts.cwd, refreshed.scopePath, spec);
        lastHtmlBehaviorGate = htmlBehaviorGate;
        Trail.browserCheck(
          refreshed.id,
          htmlBehaviorGate.status,
          "playwright",
          "deterministic HTML behavior gate",
          htmlBehaviorGate.durationMs,
          htmlBehaviorGate.reason ?? null,
          htmlBehaviorGate.output.slice(0, 500),
        );
        if (!htmlBehaviorGate.ok) {
          const reason = htmlBehaviorGateFailureReport(htmlBehaviorGate);
          const behaviorFailureSignature = browserFailureSignature(htmlBehaviorGate);
          repeatedBehaviorFailureCount = behaviorFailureSignature === previousBehaviorFailureSignature
            ? repeatedBehaviorFailureCount + 1
            : 1;
          previousBehaviorFailureSignature = behaviorFailureSignature;
          const currentBehaviorFailureSnapshot = snapshotScope(opts.cwd, refreshed.scopePath);
          const behaviorProgress = snapshotChanged(previousBehaviorFailureSnapshot, currentBehaviorFailureSnapshot);
          const shouldRepair = shouldContinueBrowserRepair({
            attempt,
            repairBudget,
            behaviorProgress,
            repeatedFailureCount: repeatedBehaviorFailureCount,
            role: opts.role,
          });
          previousBehaviorFailureSnapshot = currentBehaviorFailureSnapshot;
          if (shouldRepair.ok) {
            repairAttemptsSpent += 1;
            Trail.repairAttempt(refreshed.id, opts.role, attempt + 1, repairBudget, reason);
            currentBrief = browserRepairBrief(brief, reason, attempt + 1, refreshed.scopePath, attemptChangeSummary);
            continue;
          }
          if (shouldRepair.reason) {
            Trail.failed(opts.role, shouldRepair.reason);
          }
          if (opts.role === "builder" && behaviorProgress && repeatedBehaviorFailureCount < 3 && repairBudget < hardRepairBudget) {
            repairBudget += 1;
            const adaptiveReason = [
              reason,
              "",
              "Adaptive repair note: the scoped artifact changed since the previous browser-gate failure, so the harness is granting one extra convergence attempt.",
              `Repair budget is now ${repairBudget} of hard cap ${hardRepairBudget}.`,
            ].join("\n");
            repairAttemptsSpent += 1;
            Trail.repairAttempt(refreshed.id, opts.role, attempt + 1, repairBudget, adaptiveReason);
            currentBrief = browserRepairBrief(brief, adaptiveReason, attempt + 1, refreshed.scopePath, attemptChangeSummary);
            continue;
          }
          const qualityBlock = qualityBlockFromGates(refreshed.id, repairAttemptsSpent, { mutationGate, htmlStaticGate, htmlBehaviorGate });
          Trail.qualityBlock(qualityBlock.feature, qualityBlock.gate, qualityBlock.reason, qualityBlock.changedFiles, qualityBlock.repairAttempts, qualityBlock.nextAction);
          return { dispatch, advanced: false, mutationGate, htmlStaticGate, htmlBehaviorGate, qualityBlock };
        }
      }
      let compileGate: CompileGateResult | undefined;
      if (opts.proposedAdvance === "VERIFIED") {
        compileGate = runCompileOrImportGate({
          cwd: opts.cwd,
          scopePath: refreshed.scopePath,
          spec,
        });
        lastCompileGate = compileGate;
        Trail.compileGate(
          refreshed.id,
          compileGate.language,
          compileGate.status,
          compileGate.command,
          compileGate.cwd,
          compileGate.durationMs,
          compileGate.reason ?? null,
          `${compileGate.stdout}\n${compileGate.stderr}`.trim().slice(0, 500),
        );
        if (!compileGate.ok) {
          const reason = compileGateFailureReport(compileGate);
          if (attempt < maxRepairAttempts && opts.role === "builder") {
            repairAttemptsSpent += 1;
            Trail.repairAttempt(refreshed.id, opts.role, attempt + 1, maxRepairAttempts, reason);
            currentBrief = repairBrief(brief, reason, attempt + 1, attemptChangeSummary);
            continue;
          }
          const qualityBlock = qualityBlockFromGates(refreshed.id, repairAttemptsSpent, { compileGate, mutationGate, htmlStaticGate, htmlBehaviorGate: lastHtmlBehaviorGate });
          Trail.qualityBlock(qualityBlock.feature, qualityBlock.gate, qualityBlock.reason, qualityBlock.changedFiles, qualityBlock.repairAttempts, qualityBlock.nextAction);
          return { dispatch, advanced: false, compileGate, mutationGate, htmlStaticGate, htmlBehaviorGate: lastHtmlBehaviorGate, qualityBlock };
        }
      }
      const evidence = dispatchEvidenceForAdvance(dispatch, opts.proposedAdvance);
      if (!evidence.ok) {
        Trail.failed(opts.role, evidence.reason);
        const qualityBlock = qualityBlockFromGates(refreshed.id, repairAttemptsSpent, {
          compileGate,
          mutationGate,
          htmlStaticGate,
          htmlBehaviorGate: lastHtmlBehaviorGate,
          finalAnswerReason: evidence.reason,
        });
        Trail.qualityBlock(qualityBlock.feature, qualityBlock.gate, qualityBlock.reason, qualityBlock.changedFiles, qualityBlock.repairAttempts, qualityBlock.nextAction);
        return { dispatch: { ...dispatch, ok: false, error: evidence.reason }, advanced: false, compileGate, mutationGate, htmlStaticGate, htmlBehaviorGate: lastHtmlBehaviorGate, qualityBlock };
      }

      const result = advanceFeature(refreshed, {
        to: opts.proposedAdvance,
        evidence: evidence.text,
        cwd: opts.cwd,
      });
      if (result.ok) {
        advanced = true;
        newState = opts.proposedAdvance;
      }
      return { dispatch, advanced, newState, compileGate, mutationGate, htmlStaticGate, htmlBehaviorGate: lastHtmlBehaviorGate };
    }
  }

  if (!dispatch) {
    throw new Error("runTicket exhausted without dispatching");
  }
  return {
    dispatch,
    advanced,
    newState,
    compileGate: lastCompileGate,
    mutationGate: lastMutationGate,
    htmlStaticGate: lastHtmlStaticGate,
    htmlBehaviorGate: lastHtmlBehaviorGate,
  };
}

function snapshotChanged(
  before: MutationSnapshot | null,
  after: MutationSnapshot,
): boolean {
  if (!before) return true;
  if (before.root !== after.root) return true;
  const beforeKeys = Object.keys(before.files);
  const afterKeys = Object.keys(after.files);
  if (beforeKeys.length !== afterKeys.length) return true;
  for (const key of afterKeys) {
    if (before.files[key] !== after.files[key]) return true;
  }
  return false;
}

function shouldMutationGate(opts: RunTicketOptions): boolean {
  return opts.role === "builder" && opts.proposedAdvance === "MODEL_DONE";
}

export function shouldContinueBrowserRepair(opts: {
  attempt: number;
  repairBudget: number;
  behaviorProgress: boolean;
  repeatedFailureCount?: number;
  role: RoleName;
}): { ok: true } | { ok: false; reason?: string } {
  if (opts.role !== "builder") return { ok: false };
  if (opts.attempt >= opts.repairBudget) return { ok: false };
  if ((opts.repeatedFailureCount ?? 1) >= 3) {
    return {
      ok: false,
      reason:
        "browser repair stopped: same browser-gate failure repeated across repair attempts",
    };
  }
  if (opts.attempt > 0 && !opts.behaviorProgress) {
    return {
      ok: false,
      reason:
        "browser repair stopped: repeated browser-gate failure without scoped artifact changes since the previous attempt",
    };
  }
  return { ok: true };
}

export function browserFailureSignature(result: HtmlBehaviorGateResult): string {
  const text = `${result.reason ?? ""}\n${result.output ?? ""}`;
  const assertion = text.match(/AssertionError:\s*([^\r\n]+)/i)?.[1];
  if (assertion) return `assertion:${assertion.trim().toLowerCase()}`;
  const missingSelector = text.match(/Missing selector:\s*([^\r\n]+)/i)?.[1];
  if (missingSelector) return `missing-selector:${missingSelector.trim().toLowerCase()}`;
  const consoleError = text.match(/browser console errors:\s*([^\r\n]+)/i)?.[1];
  if (consoleError) return `console:${consoleError.trim().toLowerCase()}`;
  return text.replace(/\s+/g, " ").trim().slice(0, 240).toLowerCase();
}

export function dispatchEvidenceForAdvance(
  dispatch: DispatchResult,
  proposedAdvance: FeatureState,
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = dispatch.output.trim();
  if (isToolCallEcho(text)) {
    return {
      ok: false,
      reason: `${proposedAdvance} advancement blocked: final answer was a tool-call echo, not evidence`,
    };
  }
  if (isWeakFinalAnswer(text)) {
    return {
      ok: false,
      reason: `${proposedAdvance} advancement blocked: final answer was too thin to serve as evidence`,
    };
  }
  return { ok: true, text: text.slice(0, 200) };
}

export function qualityBlockFromGates(
  feature: string,
  repairAttempts: number,
  gates: {
    compileGate?: CompileGateResult;
    mutationGate?: MutationGateResult;
    htmlStaticGate?: HtmlStaticGateResult;
    htmlBehaviorGate?: HtmlBehaviorGateResult;
    finalAnswerReason?: string;
  },
): QualityBlockSummary {
  if (gates.finalAnswerReason) {
    return {
      feature,
      gate: "final_answer",
      reason: gates.finalAnswerReason,
      changedFiles: gates.mutationGate?.changedFiles ?? [],
      repairAttempts,
      nextAction: "Ask the agent to summarize changed files and verification, or inspect the artifact before retrying.",
    };
  }
  if (gates.htmlBehaviorGate && !gates.htmlBehaviorGate.ok) {
    return {
      feature,
      gate: "html_behavior_gate",
      reason: gates.htmlBehaviorGate.reason ?? "browser behavior gate failed",
      changedFiles: gates.mutationGate?.changedFiles ?? [],
      repairAttempts,
      nextAction: "Open the HTML artifact, reproduce the browser assertion, and patch the event/state/render/persistence path.",
    };
  }
  if (gates.htmlStaticGate && !gates.htmlStaticGate.ok) {
    const firstIssue = gates.htmlStaticGate.issues[0];
    return {
      feature,
      gate: "html_static_gate",
      reason: firstIssue
        ? `${firstIssue.file}: ${firstIssue.code}: ${firstIssue.message}`
        : gates.htmlStaticGate.reason ?? "static HTML gate failed",
      changedFiles: gates.mutationGate?.changedFiles ?? [],
      repairAttempts,
      nextAction: "Fix the named static HTML issue first, then rerun the builder dispatch.",
    };
  }
  if (gates.compileGate && !gates.compileGate.ok) {
    return {
      feature,
      gate: "compile_gate",
      reason: gates.compileGate.reason ?? (gates.compileGate.stderr.trim().slice(0, 200) || "compile/import gate failed"),
      changedFiles: gates.mutationGate?.changedFiles ?? [],
      repairAttempts,
      nextAction: "Run the compile command locally, fix the first compiler error, then rerun verification.",
    };
  }
  if (gates.mutationGate && !gates.mutationGate.ok) {
    return {
      feature,
      gate: "mutation_gate",
      reason: gates.mutationGate.reason ?? "no scoped implementation mutation detected",
      changedFiles: gates.mutationGate.changedFiles,
      repairAttempts,
      nextAction: "Create or edit an implementation artifact inside the feature scope before claiming completion.",
    };
  }
  return {
    feature,
    gate: "unknown",
    reason: "feature did not advance after dispatch",
    changedFiles: gates.mutationGate?.changedFiles ?? [],
    repairAttempts,
    nextAction: "Inspect the latest trail entries and rerun with a narrower brief.",
  };
}

export function qualityBlockFromDispatchFailure(
  feature: string,
  dispatch: DispatchResult,
  repairAttempts: number,
  changedFiles: string[],
): QualityBlockSummary {
  const text = `${dispatch.error ?? ""}\n${dispatch.output ?? ""}`;
  const processReason = longLivedCommandFailureReport(dispatch);
  if (processReason) {
    return {
      feature,
      gate: "process_hygiene",
      reason: firstLine(processReason),
      changedFiles,
      repairAttempts,
      nextAction: "Retry with a narrower brief that avoids shell discovery; use read/edit/write tools instead of blocked commands.",
    };
  }
  const toolReason = unavailableToolFailureReport(dispatch);
  if (toolReason) {
    return {
      feature,
      gate: "tool_name",
      reason: firstLine(toolReason),
      changedFiles,
      repairAttempts,
      nextAction: "Retry using only the exact tool names listed in the role capability prompt.",
    };
  }
  const scopeReason = text.match(/Blocked (?:unsafe )?mutation path "([^"]+)"/i)?.[0];
  if (scopeReason) {
    return {
      feature,
      gate: "mutation_scope",
      reason: scopeReason,
      changedFiles,
      repairAttempts,
      nextAction: "Move the implementation back inside the feature scope or split outside-scope wiring into a later task.",
    };
  }
  return {
    feature,
    gate: "dispatch_failure",
    reason: dispatch.error ?? "subagent dispatch failed",
    changedFiles,
    repairAttempts,
    nextAction: "Inspect the response and trail tail, then retry with a smaller task or stricter tool instruction.",
  };
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? text.trim();
}

export function repairBrief(
  originalBrief: string,
  reason: string,
  attempt: number,
  attemptChangeSummary?: string | null,
): string {
  return [
    compactRepairTicket(originalBrief),
    "",
    `=== Repair attempt ${attempt} ===`,
    "Your previous attempt was blocked by the harness quality gates.",
    "This is a same-session repair turn; the full original ticket and prior tool context are already in the Pi session.",
    "Fix only the issues below. Do not restart from scratch if a scoped artifact already exists.",
    "Read the relevant file first, make the smallest targeted edit, then verify again.",
    "Preserve the user's intent, but obey the current capability envelope exactly.",
    "",
    "Gate failure summary:",
    compactPromptText(reason, REPAIR_REASON_PROMPT_LIMIT),
    repairChangeSection(attemptChangeSummary),
  ].join("\n");
}

export function browserRepairBrief(
  originalBrief: string,
  reason: string,
  attempt: number,
  scopePath?: string,
  attemptChangeSummary?: string | null,
): string {
  return [
    compactRepairTicket(originalBrief),
    "",
    `=== Browser repair attempt ${attempt} ===`,
    "Your previous attempt was blocked by the deterministic browser behavior gate.",
    "This is a same-session repair turn; the full original ticket and prior tool context are already in the Pi session.",
    "This is a debugging task, not a rewrite task. Preserve the existing app and patch only the broken interaction path.",
    "",
    "Mandatory repair protocol:",
    `1. Read the current HTML file first (${scopePath ? `${scopePath.replace(/\\$/, "/")}index.html` : "the scoped index.html"}).`,
    "2. Identify the exact event path: control selector -> event listener -> state update -> render call -> localStorage write/read.",
    "3. State the most likely failing line or expression before editing.",
    "4. Make the smallest targeted edit to that event/listener/render/persistence path.",
    "5. Do not redesign the UI, rename unrelated selectors, add dependencies, start servers, or use network commands.",
    "6. Final response must name the patched path and why the browser assertion should now pass.",
    "",
    "Gate failure summary:",
    compactPromptText(reason, REPAIR_REASON_PROMPT_LIMIT),
    repairChangeSection(attemptChangeSummary),
  ].join("\n");
}

function repairChangeSection(attemptChangeSummary?: string | null): string {
  if (!attemptChangeSummary) return "";
  return [
    "",
    "Scoped artifact changes from the previous attempt:",
    compactPromptText(attemptChangeSummary, REPAIR_CHANGE_SUMMARY_PROMPT_LIMIT),
  ].join("\n");
}

export function compactRepairTicket(originalBrief: string): string {
  return [
    "=== Ticket context summary ===",
    compactPromptText(originalBrief, REPAIR_TICKET_PROMPT_LIMIT),
  ].join("\n");
}

export function compactPromptText(text: string, limit: number): string {
  const normalized = text.trim();
  if (normalized.length <= limit) return normalized;
  const marker = `\n\n[...${normalized.length - limit} chars omitted; keeping head and tail for repair context...]\n\n`;
  const headLength = Math.max(0, Math.ceil((limit - marker.length) * 0.6));
  const tailLength = Math.max(0, limit - marker.length - headLength);
  return `${normalized.slice(0, headLength).trimEnd()}${marker}${normalized.slice(-tailLength).trimStart()}`;
}

export function scopedAttemptChangeSummary(
  before: MutationSnapshot | null,
  after: MutationSnapshot,
): string {
  if (!before) {
    const files = Object.keys(after.files).sort();
    return files.length
      ? `Baseline snapshot captured. Current scoped files: ${summarizeFiles(files)}`
      : "Baseline snapshot captured. No scoped files exist yet.";
  }

  if (before.root !== after.root) {
    return `Scope root changed from ${before.root} to ${after.root}. Current scoped files: ${summarizeFiles(Object.keys(after.files).sort())}`;
  }

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const [file, fingerprint] of Object.entries(after.files)) {
    if (!(file in before.files)) {
      added.push(file);
    } else if (before.files[file] !== fingerprint) {
      modified.push(file);
    }
  }
  for (const file of Object.keys(before.files)) {
    if (!(file in after.files)) deleted.push(file);
  }

  const sections = [
    fileDeltaLine("Added", added),
    fileDeltaLine("Modified", modified),
    fileDeltaLine("Deleted", deleted),
  ].filter(Boolean);
  return sections.length ? sections.join("\n") : "No scoped file changes were detected in the previous attempt.";
}

function fileDeltaLine(label: string, files: string[]): string {
  if (!files.length) return "";
  return `${label}: ${summarizeFiles(files.sort())}`;
}

function summarizeFiles(files: string[], limit = 12): string {
  if (!files.length) return "none";
  const visible = files.slice(0, limit);
  const hidden = files.length - visible.length;
  return hidden > 0 ? `${visible.join(", ")} (+${hidden} more)` : visible.join(", ");
}

function scopeViolationFailureReport(dispatch: DispatchResult, opts: RunTicketOptions): string | null {
  const text = `${dispatch.error ?? ""}\n${dispatch.output ?? ""}`;
  if (!/Blocked (unsafe )?mutation path/i.test(text)) return null;
  const blocked = text.match(/Blocked (?:unsafe )?mutation path "([^"]+)"/i)?.[1] ?? "(unknown)";
  const scope = opts.feature.scopePath ?? "(none)";
  return [
    "Gate: mutation_scope",
    `Blocked path: ${blocked}`,
    `Allowed scope: ${scope}`,
    "The previous attempt tried to write outside the feature scope.",
    "Repair instruction: implement only the scoped package/artifact. Do not create CLI wiring, app entrypoints, tests, docs, or config outside the allowed scope.",
    "If the original request implies outside-scope wiring, leave that as a note in the final response instead of editing outside scope.",
  ].join("\n");
}

function unavailableToolFailureReport(dispatch: DispatchResult): string | null {
  const text = `${dispatch.error ?? ""}\n${dispatch.output ?? ""}`;
  const match = text.match(/Sarvam returned unavailable tool call "([^"]+)". Available tools: ([^\n.]+)/i);
  if (!match) return null;
  const available = match[2].trim();
  return [
    "Gate: tool_name",
    `Unavailable tool: ${match[1]}`,
    `Available tools: ${available}`,
    "The previous attempt called a capability label or invented tool name instead of an executable Pi tool.",
    `Repair instruction: retry using only these exact tool names: ${available}.`,
    "If write, edit, or bash are not in the available-tools list, do not call them.",
    "Do not call bashcap, readcap, grepcap, or other capability names as tools.",
  ].join("\n");
}

function longLivedCommandFailureReport(dispatch: DispatchResult): string | null {
  const text = `${dispatch.error ?? ""}\n${dispatch.output ?? ""}`;
  const match = text.match(/Blocked (?:long-lived )?bash command "([^"]+)"/i);
  if (!match) return null;
  return [
    "Gate: process_hygiene",
    `Blocked command: ${match[1]}`,
    "The previous attempt used a bash command outside the role's runtime allowlist or tried to start a long-lived process.",
    "Repair instruction: use only the allowed command roots shown in the BashCap envelope, and prefer one-shot checks that terminate.",
    "For static HTML, do not start an HTTP server. The harness will run deterministic browser checks after the Builder returns.",
  ].join("\n");
}

function mutationGateFailureReport(result: MutationGateResult): string {
  return [
    "Gate: mutation_gate",
    `Root: ${result.root}`,
    `Reason: ${result.reason ?? "no scoped mutation detected"}`,
    result.changedFiles.length ? `Changed files: ${result.changedFiles.join(", ")}` : "Changed files: none",
    "Repair instruction: create or edit the required implementation file inside the root above. Do not only describe the implementation.",
    "Do not create entrypoints, tests, docs, config, or CLI wiring outside the feature scope.",
    "Use only the exact available tool names from the prompt, such as read/write/edit/bash; do not call capability names as tools.",
  ].join("\n");
}

function requireImplementationMutation(result: MutationGateResult): MutationGateResult {
  const implementationFiles = result.changedFiles.filter((file) => !isSupportOnlyFile(file));
  if (implementationFiles.length > 0) return result;
  return {
    ...result,
    ok: false,
    reason:
      "Builder changed only tests/docs/config or support files; MODEL_DONE requires at least one implementation artifact in scope",
  };
}

function isSupportOnlyFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.endsWith("_test.go") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.tsx") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".spec.tsx") ||
    normalized.endsWith(".md") ||
    normalized.endsWith(".txt") ||
    normalized.endsWith(".json") ||
    normalized.endsWith(".yaml") ||
    normalized.endsWith(".yml")
  );
}

function htmlStaticGateFailureReport(result: HtmlStaticGateResult): string {
  return [
    "Gate: html_static_gate",
    `Root: ${result.root}`,
    `Files checked: ${result.filesChecked}`,
    ...result.issues.slice(0, 8).map((issue) => `- ${issue.file}: ${issue.code}: ${issue.message}`),
  ].join("\n");
}

function compileGateFailureReport(result: CompileGateResult): string {
  return [
    "Gate: compile_gate",
    `Command: ${result.command ?? "(none)"}`,
    `CWD: ${result.cwd}`,
    `Reason: ${result.reason ?? "compile/import gate failed"}`,
    result.stdout.trim() ? `stdout:\n${result.stdout.trim().slice(0, 1000)}` : "",
    result.stderr.trim() ? `stderr:\n${result.stderr.trim().slice(0, 1000)}` : "",
  ].filter(Boolean).join("\n");
}

export function htmlBehaviorGateFailureReport(result: HtmlBehaviorGateResult): string {
  const diagnostics = htmlBehaviorGateDiagnostics(result);
  return [
    "Gate: html_behavior_gate",
    `Target: ${result.targetFile ?? "(none)"}`,
    `Reason: ${result.reason ?? "browser behavior gate failed"}`,
    result.output.trim() ? `output:\n${result.output.trim().slice(0, 1000)}` : "",
    diagnostics.length ? ["Repair diagnostics:", ...diagnostics.map((item) => `- ${item}`)].join("\n") : "",
  ].filter(Boolean).join("\n");
}

function htmlBehaviorGateDiagnostics(result: HtmlBehaviorGateResult): string[] {
  const text = `${result.reason ?? ""}\n${result.output ?? ""}`;
  const hints: string[] = [];
  if (/submitted (?:session|item) is not visible/i.test(text)) {
    hints.push("The form submit path did not render the newly submitted record. Check that the submit listener is attached to the actual form and calls event.preventDefault().");
    hints.push("If you pass an object method as an event callback, bind it or wrap it: addEventListener('DOMContentLoaded', () => ui.init()). Unbound methods often make this point at document/window instead of the app object.");
    hints.push("After saving state, call the render function and ensure it writes into the visible list/container the probe can read.");
  }
  if (/did not persist after reload/i.test(text)) {
    hints.push("The saved record disappeared after reload. Check that localStorage.setItem runs after add/delete/clear and that startup loads from the same key before rendering.");
  }
  if (/attendee count is not visible/i.test(text)) {
    hints.push("The planner probe submitted 12 attendees but did not see 12 in the page. Render the attendee count in either the row or totals area.");
  }
  if (/expected line\/grand total 80/i.test(text)) {
    hints.push("The expense probe submitted quantity=2 and price=40. Recalculate and render a visible 80 or 80.00 line/grand total after submit.");
  }
  if (/counter text did not change/i.test(text)) {
    hints.push("The counter button did not change visible text. Check the click listener, state increment, render call, and localStorage update.");
  }
  if (/Missing selector:/i.test(text)) {
    hints.push("The probe could not find expected controls. Prefer stable ids/names: expense uses itemName, quantity, unitPrice; planner uses title/sessionTitle, date, startTime, leadSinger, attendees.");
  }
  if (/browser console errors:/i.test(text)) {
    hints.push("Fix the first browser console error before changing behavior. It often prevents event listeners from attaching or render functions from running.");
  }
  if (!hints.length) {
    hints.push("Reproduce the behavior manually from the browser-gate output: fill the form, click submit, verify visible output, reload, and verify persistence.");
    hints.push("Make the smallest targeted edit to the event listener, state update, render function, or localStorage key that explains the failed assertion.");
  }
  return hints;
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
