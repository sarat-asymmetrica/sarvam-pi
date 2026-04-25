// Translate a CapabilityEnvelope into the runtime values that the existing
// sarvam-subagent-extension expects:
//   --tools <comma-separated tool names>
//   SARVAM_PI_MUTATION_ROOT=<scope path>     (for WriteCap/EditCap scopes)
//   SARVAM_PI_BASH_TIMEOUT_MS=<ms>           (informational; current ext doesn't read it)
//
// This is the CHOKEPOINT where capability-shaped intent becomes Pi-shaped reality.
// All scope enforcement at the engine layer goes through this translation.
import { Capability, CapabilityEnvelope } from "./types.js";

export interface PiToolPlan {
  toolsArg: string; // comma-separated for --tools
  envOverrides: Record<string, string>;
}

const TOOL_FOR_CAP: Partial<Record<Capability["kind"], string[]>> = {
  ReadCap: ["read"],
  GrepCap: ["grep"],
  FindCap: ["find"],
  LsCap: ["ls"],
  WriteCap: ["write"],
  EditCap: ["edit"],
  BashCap: ["bash"],
  TestCap: ["bash"], // for now: TestCap is bash-with-test-allowlist
  WebSearchCap: [], // sarvam-pi engine layer does not yet ship a web-search tool
  AdvisoryCap: [], // pure-text capability — no engine-layer tool
  SpecCap: [], // shoshin-level capability, not a Pi tool
  UserTalkCap: [], // shoshin-level capability, not a Pi tool
  MemoryWriteCap: [], // shoshin-level capability — Librarian writes via own path
  BlockCap: [], // shoshin-level capability
};

export function toPiPlan(env: CapabilityEnvelope): PiToolPlan {
  const tools = new Set<string>();
  const envOverrides: Record<string, string> = {};

  for (const cap of env.capabilities) {
    const piTools = TOOL_FOR_CAP[cap.kind] ?? [];
    for (const t of piTools) tools.add(t);

    if (cap.kind === "WriteCap" || cap.kind === "EditCap") {
      // Engine-layer mutation guard reads SARVAM_PI_MUTATION_ROOT for scope.
      envOverrides.SARVAM_PI_MUTATION_ROOT = cap.scope;
    }
    if (cap.kind === "BashCap") {
      if (cap.timeoutMs) {
        envOverrides.SARVAM_PI_BASH_TIMEOUT_MS = String(cap.timeoutMs);
      }
      // Allowed commands aren't yet enforced by engine layer; we surface them in
      // the system prompt instead so the model self-restricts (Contract I principle).
    }
  }

  return {
    toolsArg: Array.from(tools).join(","),
    envOverrides,
  };
}

// Plain-text summary of the envelope for prompt injection. The model reads this
// alongside the capability whitelist in the system prompt.
export function envelopeSummary(env: CapabilityEnvelope): string {
  const lines: string[] = [];
  for (const cap of env.capabilities) {
    if (cap.kind === "WriteCap" || cap.kind === "EditCap") {
      lines.push(`  - ${cap.kind}<scope: ${cap.scope}>`);
    } else if (cap.kind === "BashCap") {
      const cmds = cap.allowedCommands?.length ? cap.allowedCommands.join(",") : "any";
      lines.push(`  - BashCap<cwd: ${cap.cwd}, allowed: [${cmds}], timeoutMs: ${cap.timeoutMs ?? 60000}>`);
    } else if (cap.kind === "WebSearchCap") {
      const dom = cap.allowedDomains?.length ? cap.allowedDomains.join(",") : "any";
      lines.push(`  - WebSearchCap<domains: ${dom}>`);
    } else {
      lines.push(`  - ${cap.kind}`);
    }
  }
  return lines.join("\n");
}
