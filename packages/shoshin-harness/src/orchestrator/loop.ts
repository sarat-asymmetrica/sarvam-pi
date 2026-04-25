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
import { runCompileOrImportGate, CompileGateResult } from "./compile-gate.js";
import {
  compareMutationSnapshot,
  MutationGateResult,
  snapshotScope,
} from "./mutation-gate.js";
import { runHtmlStaticGate, HtmlStaticGateResult } from "./html-static-gate.js";
import { runHtmlBehaviorGate, HtmlBehaviorGateResult } from "./html-behavior-gate.js";
import { Trail } from "../trail/writer.js";

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
  let mutationSnapshot: ReturnType<typeof snapshotScope> | null = null;
  const maxRepairAttempts = Math.max(0, opts.maxRepairAttempts ?? 2);

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
      architect.output,
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
  let currentBrief = brief;

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt++) {
    if (attempt > 0) {
      mutationSnapshot = shouldMutationGate(opts) ? snapshotScope(opts.cwd, opts.feature.scopePath) : null;
    }
    dispatch = await dispatchSubagent({
      role: opts.role,
      ticketBrief: currentBrief,
      scopePath: opts.feature.scopePath,
      spec,
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs,
      sessionKey: `${sessionBase}-${opts.role}`,
    });

    if (!dispatch.ok) {
      const scopeReason = scopeViolationFailureReport(dispatch, opts);
      if (scopeReason && attempt < maxRepairAttempts && opts.role === "builder") {
        Trail.repairAttempt(opts.feature.id, opts.role, attempt + 1, maxRepairAttempts, scopeReason);
        currentBrief = repairBrief(brief, scopeReason, attempt + 1);
        continue;
      }
      const toolReason = unavailableToolFailureReport(dispatch);
      if (toolReason && attempt < maxRepairAttempts && opts.role === "builder") {
        Trail.repairAttempt(opts.feature.id, opts.role, attempt + 1, maxRepairAttempts, toolReason);
        currentBrief = repairBrief(brief, toolReason, attempt + 1);
        continue;
      }
      const processReason = longLivedCommandFailureReport(dispatch);
      if (processReason && attempt < maxRepairAttempts && opts.role === "builder") {
        Trail.repairAttempt(opts.feature.id, opts.role, attempt + 1, maxRepairAttempts, processReason);
        currentBrief = repairBrief(brief, processReason, attempt + 1);
        continue;
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
            Trail.repairAttempt(refreshed.id, opts.role, attempt + 1, maxRepairAttempts, reason);
            currentBrief = repairBrief(brief, reason, attempt + 1);
            continue;
          }
          return { dispatch, advanced: false, mutationGate };
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
            Trail.repairAttempt(refreshed.id, opts.role, attempt + 1, maxRepairAttempts, reason);
            currentBrief = repairBrief(brief, reason, attempt + 1);
            continue;
          }
          return { dispatch, advanced: false, mutationGate, htmlStaticGate };
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
          if (attempt < maxRepairAttempts && opts.role === "builder") {
            Trail.repairAttempt(refreshed.id, opts.role, attempt + 1, maxRepairAttempts, reason);
            currentBrief = repairBrief(brief, reason, attempt + 1);
            continue;
          }
          return { dispatch, advanced: false, mutationGate, htmlStaticGate, htmlBehaviorGate };
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
            Trail.repairAttempt(refreshed.id, opts.role, attempt + 1, maxRepairAttempts, reason);
            currentBrief = repairBrief(brief, reason, attempt + 1);
            continue;
          }
          return { dispatch, advanced: false, compileGate, mutationGate, htmlStaticGate, htmlBehaviorGate: lastHtmlBehaviorGate };
        }
      }
      const result = advanceFeature(refreshed, {
        to: opts.proposedAdvance,
        evidence: dispatch.output.slice(0, 200),
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

function shouldMutationGate(opts: RunTicketOptions): boolean {
  return opts.role === "builder" && opts.proposedAdvance === "MODEL_DONE";
}

function repairBrief(originalBrief: string, reason: string, attempt: number): string {
  return [
    originalBrief,
    "",
    `=== Repair attempt ${attempt} ===`,
    "Your previous attempt was blocked by the harness quality gates.",
    "Fix only the issues below. Do not restart from scratch if a scoped artifact already exists.",
    "Read the relevant file first, make the smallest targeted edit, then verify again.",
    "Preserve the user's intent, but obey the current capability envelope exactly.",
    "",
    reason,
  ].join("\n");
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

function htmlBehaviorGateFailureReport(result: HtmlBehaviorGateResult): string {
  return [
    "Gate: html_behavior_gate",
    `Target: ${result.targetFile ?? "(none)"}`,
    `Reason: ${result.reason ?? "browser behavior gate failed"}`,
    result.output.trim() ? `output:\n${result.output.trim().slice(0, 1000)}` : "",
  ].filter(Boolean).join("\n");
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
