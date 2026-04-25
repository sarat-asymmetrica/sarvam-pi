// Append-only stigmergy trail writer. One JSONL line per call. The writer is the
// single funnel — every harness operation that produces a fact about the world
// goes through here. The writer never throws so trail logging cannot break the
// hot path; trail-write failures go to stderr and the call returns.
import { TrailRecord, TrailKind, TrailRecordBase } from "./types.js";
import { appendJsonl } from "../util/json-io.js";
import { shoshinFile } from "../util/paths.js";

let sessionId: string | undefined;

export function setTrailSession(id: string): void {
  sessionId = id;
}

export function logTrail(
  record: Omit<TrailRecord, "ts" | "session"> & Partial<TrailRecordBase>,
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
