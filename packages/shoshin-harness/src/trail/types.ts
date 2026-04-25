// Stigmergy trail. Append-only JSONL log of meaningful events. Subagents read the
// tail of this file as their pheromone substrate — coordination is implicit, no
// message bus.
//
// The schema is intentionally a discriminated union rather than a free-form blob;
// readers can filter by kind without parsing prose.
//
// Cap'n Proto schema lives in schemas/trail.capnp; codegen later. JSONL today.

export type TrailKind =
  | "spec_written"
  | "feature_advance"
  | "subagent_spawn"
  | "subagent_complete"
  | "subagent_failed"
  | "session_summary"
  | "compile_gate"
  | "mutation_gate"
  | "html_static_gate"
  | "repair_attempt"
  | "browser_check"
  | "tool_call"
  | "user_prompt"
  | "memory_write"
  | "memory_compact"
  | "morning_plan"
  | "evening_reconvene"
  | "time_pulse"
  | "capability_revoked"
  | "capability_pause";

export interface TrailRecordBase {
  ts: string; // ISO timestamp, written by writer
  kind: TrailKind;
  // Optional context fields (may all be undefined; readers tolerate it).
  feature?: string;
  role?: string;
  session?: string;
  subagent?: string;
}

// Discriminated union — each kind's expected payload.
export interface TrailSpecWritten extends TrailRecordBase {
  kind: "spec_written";
  source: string;
  name: string;
}

export interface TrailFeatureAdvance extends TrailRecordBase {
  kind: "feature_advance";
  feature: string;
  from: string;
  to: string;
  evidence: string | null;
}

export interface TrailSubagentSpawn extends TrailRecordBase {
  kind: "subagent_spawn";
  role: string;
  task: string;
  envelope: string[];
}

export interface TrailSubagentComplete extends TrailRecordBase {
  kind: "subagent_complete";
  role: string;
  durationMs: number;
  outputDigest: string;
}

export interface TrailSubagentFailed extends TrailRecordBase {
  kind: "subagent_failed";
  role: string;
  error: string;
}

export interface TrailSessionSummary extends TrailRecordBase {
  kind: "session_summary";
  role: string;
  piSessionId: string | null;
  sessionFile: string | null;
  durationMs: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number | null;
}

export interface TrailCompileGate extends TrailRecordBase {
  kind: "compile_gate";
  feature: string;
  language: string;
  status: "passed" | "failed" | "skipped";
  command: string | null;
  cwd: string;
  durationMs: number;
  reason: string | null;
  outputDigest: string;
}

export interface TrailMutationGate extends TrailRecordBase {
  kind: "mutation_gate";
  feature: string;
  status: "passed" | "failed";
  root: string;
  changedFiles: string[];
  reason: string | null;
}

export interface TrailHtmlStaticGate extends TrailRecordBase {
  kind: "html_static_gate";
  feature: string;
  status: "passed" | "failed" | "skipped";
  root: string;
  filesChecked: number;
  issueCount: number;
  issues: string[];
  reason: string | null;
}

export interface TrailRepairAttempt extends TrailRecordBase {
  kind: "repair_attempt";
  feature: string;
  role: string;
  attempt: number;
  maxAttempts: number;
  reason: string;
}

export interface TrailBrowserCheck extends TrailRecordBase {
  kind: "browser_check";
  feature?: string;
  status: "passed" | "failed" | "skipped";
  engine: "browser-use";
  task: string;
  durationMs: number;
  reason: string | null;
  outputDigest: string;
}

export interface TrailToolCall extends TrailRecordBase {
  kind: "tool_call";
  tool: string;
  argsDigest: string;
}

export interface TrailUserPrompt extends TrailRecordBase {
  kind: "user_prompt";
  promptDigest: string;
}

export interface TrailMemoryWrite extends TrailRecordBase {
  kind: "memory_write";
  file: string;
  bytesAdded: number;
}

export interface TrailMemoryCompact extends TrailRecordBase {
  kind: "memory_compact";
  before: number;
  after: number;
}

export interface TrailMorningPlan extends TrailRecordBase {
  kind: "morning_plan";
  ticketCount: number;
}

export interface TrailEveningReconvene extends TrailRecordBase {
  kind: "evening_reconvene";
  ticketsAdvanced: number;
  ticketsBlocked: number;
}

export interface TrailTimePulse extends TrailRecordBase {
  kind: "time_pulse";
  sessionTurns: number;
  elapsedMs: number;
  repoAgeDays: number | null;
  featurePace: string;
}

export interface TrailCapabilityRevoked extends TrailRecordBase {
  kind: "capability_revoked";
  role: string;
  capability: string;
  reason: string;
}

export interface TrailCapabilityPause extends TrailRecordBase {
  kind: "capability_pause";
  required: string;
  message: string;
}

export type TrailRecord =
  | TrailSpecWritten
  | TrailFeatureAdvance
  | TrailSubagentSpawn
  | TrailSubagentComplete
  | TrailSubagentFailed
  | TrailSessionSummary
  | TrailCompileGate
  | TrailMutationGate
  | TrailHtmlStaticGate
  | TrailRepairAttempt
  | TrailBrowserCheck
  | TrailToolCall
  | TrailUserPrompt
  | TrailMemoryWrite
  | TrailMemoryCompact
  | TrailMorningPlan
  | TrailEveningReconvene
  | TrailTimePulse
  | TrailCapabilityRevoked
  | TrailCapabilityPause;
