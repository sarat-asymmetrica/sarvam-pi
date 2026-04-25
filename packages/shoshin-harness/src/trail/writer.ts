// Append-only stigmergy trail writer. One JSONL line per call. The writer is the
// single funnel — every harness operation that produces a fact about the world
// goes through here. The writer never throws so trail logging cannot break the
// hot path; trail-write failures go to stderr and the call returns.
import { TrailRecord, TrailKind, TrailRecordBase } from "./types.js";
import { appendJsonl } from "../util/json-io.js";
import { shoshinFile } from "../util/paths.js";

let sessionId: string | undefined;

type TrailInput = Partial<TrailRecordBase> & {
  kind: TrailKind;
  [key: string]: unknown;
};

export function setTrailSession(id: string): void {
  sessionId = id;
}

export function logTrail(
  record: TrailInput,
): void {
  try {
    const full = {
      ts: new Date().toISOString(),
      session: sessionId,
      ...record,
    } as TrailRecord;
    appendJsonl(shoshinFile("trail"), full);
  } catch (err) {
    // Trail write failures are non-fatal; surface but do not throw.
    process.stderr.write(
      `[shoshin] trail write failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

// Convenience: typed kind-specific helpers (avoid the discriminator dance at every callsite).
export const Trail = {
  spawn(role: string, task: string, envelope: string[]): void {
    logTrail({ kind: "subagent_spawn", role, task, envelope });
  },
  complete(role: string, durationMs: number, outputDigest: string): void {
    logTrail({ kind: "subagent_complete", role, durationMs, outputDigest });
  },
  failed(role: string, error: string): void {
    logTrail({ kind: "subagent_failed", role, error });
  },
  sessionSummary(
    role: string,
    piSessionId: string | null,
    sessionFile: string | null,
    durationMs: number,
    tokens: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    },
    cost: number | null,
  ): void {
    logTrail({
      kind: "session_summary",
      role,
      piSessionId,
      sessionFile,
      durationMs,
      tokens,
      cost,
    });
  },
  compileGate(
    feature: string,
    language: string,
    status: "passed" | "failed" | "skipped",
    command: string | null,
    cwd: string,
    durationMs: number,
    reason: string | null,
    outputDigest: string,
  ): void {
    logTrail({
      kind: "compile_gate",
      feature,
      language,
      status,
      command,
      cwd,
      durationMs,
      reason,
      outputDigest,
    });
  },
  mutationGate(
    feature: string,
    status: "passed" | "failed",
    root: string,
    changedFiles: string[],
    reason: string | null,
  ): void {
    logTrail({
      kind: "mutation_gate",
      feature,
      status,
      root,
      changedFiles,
      reason,
    });
  },
  htmlStaticGate(
    feature: string,
    status: "passed" | "failed" | "skipped",
    root: string,
    filesChecked: number,
    issues: string[],
    reason: string | null,
  ): void {
    logTrail({
      kind: "html_static_gate",
      feature,
      status,
      root,
      filesChecked,
      issueCount: issues.length,
      issues,
      reason,
    });
  },
  repairAttempt(
    feature: string,
    role: string,
    attempt: number,
    maxAttempts: number,
    reason: string,
  ): void {
    logTrail({
      kind: "repair_attempt",
      feature,
      role,
      attempt,
      maxAttempts,
      reason,
    });
  },
  browserCheck(
    feature: string | undefined,
    status: "passed" | "failed" | "skipped",
    engine: "browser-use" | "playwright",
    task: string,
    durationMs: number,
    reason: string | null,
    outputDigest: string,
  ): void {
    logTrail({
      kind: "browser_check",
      feature,
      status,
      engine,
      task,
      durationMs,
      reason,
      outputDigest,
    });
  },
  processHygiene(
    action: "timeout_kill" | "long_lived_command_detected" | "tool_echo_synthesis",
    pid: number | null,
    command: string | null,
    durationMs: number,
    reason: string,
  ): void {
    logTrail({
      kind: "process_hygiene",
      action,
      pid,
      command,
      durationMs,
      reason,
    });
  },
  pulse(
    sessionTurns: number,
    elapsedMs: number,
    repoAgeDays: number | null,
    featurePace: string,
  ): void {
    logTrail({ kind: "time_pulse", sessionTurns, elapsedMs, repoAgeDays, featurePace });
  },
  morning(ticketCount: number): void {
    logTrail({ kind: "morning_plan", ticketCount });
  },
  evening(ticketsAdvanced: number, ticketsBlocked: number): void {
    logTrail({ kind: "evening_reconvene", ticketsAdvanced, ticketsBlocked });
  },
};
