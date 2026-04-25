// Capability envelope types. At runtime, the orchestrator mints a capability bundle
// per subagent spawn; the bundle filters which Pi tools the subagent can invoke.
//
// Foundation phase: TS shape only; Cap'n Proto codegen later.
// See docs/CAPABILITY_ENVELOPE.md.

export type CapabilityKind =
  | "ReadCap"
  | "GrepCap"
  | "FindCap"
  | "LsCap"
  | "WriteCap"
  | "EditCap"
  | "BashCap"
  | "WebSearchCap"
  | "TestCap"
  | "AdvisoryCap"
  | "SpecCap"
  | "UserTalkCap"
  | "MemoryWriteCap"
  | "BlockCap";

export interface CapabilityBase {
  kind: CapabilityKind;
}

export interface ScopedWriteCap extends CapabilityBase {
  kind: "WriteCap";
  scope: string; // path prefix, e.g. "internal/feature_x/"
}

export interface ScopedEditCap extends CapabilityBase {
  kind: "EditCap";
  scope: string;
}

export interface ScopedBashCap extends CapabilityBase {
  kind: "BashCap";
  cwd: string;
  allowedCommands?: string[]; // empty/undefined = any
  timeoutMs?: number;
}

export interface WebSearchScopedCap extends CapabilityBase {
  kind: "WebSearchCap";
  allowedDomains?: string[]; // empty/undefined = any public
}

export type Capability =
  | (CapabilityBase & {
      kind: Exclude<
        CapabilityKind,
        "WriteCap" | "EditCap" | "BashCap" | "WebSearchCap"
      >;
    })
  | ScopedWriteCap
  | ScopedEditCap
  | ScopedBashCap
  | WebSearchScopedCap;

export interface CapabilityEnvelope {
  role: string;
  capabilities: Capability[];
}

// Operations that are NEVER minted for any subagent. The orchestrator pauses and
// surfaces a human-action message instead.
export const NEVER_MINTED = [
  "password_entry",
  "ssh_key_use",
  "vpn_unlock",
  "oauth_consent",
  "physical_pairing",
  "production_deploy",
  "main_branch_push",
  "master_branch_push",
  "prod_branch_push",
] as const;
export type NeverMinted = (typeof NEVER_MINTED)[number];
