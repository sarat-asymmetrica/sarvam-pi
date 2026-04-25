// Per-role default capability envelopes. These are the runtime-shaped objects;
// the abstract list lives in roles/catalog.ts. The runtime objects carry scope/cwd
// information that is missing from the abstract list.
//
// At dispatch time, the orchestrator passes `scope` overrides for Builder/Editor
// envelopes (e.g. set scope to the ticket's feature.scopePath).
import { Capability, CapabilityEnvelope } from "./types.js";
import { RoleName } from "../roles/types.js";

interface EnvelopeContext {
  scopePath?: string;
  cwd: string;
  webDomains?: string[];
  browserOrigins?: string[];
}

const allowedBuilderCommands = ["test", "build", "lint", "go", "npm", "tsc", "vitest", "pytest"];
const allowedReviewerCommands = ["diff", "log", "test", "git"];
const allowedQaCommands = ["test", "run", "go", "npm", "vitest", "pytest"];
const allowedLibrarianCommands = ["git log", "git diff", "git show"];

export function envelopeForRole(role: RoleName, ctx: EnvelopeContext): CapabilityEnvelope {
  const caps: Capability[] = [];

  switch (role) {
    case "host":
      // The host is the user-facing concierge. Reads to quote spec/trail to
      // the user, no writes. Cannot mutate code or call shell — when the
      // user asks for action, host hands off to a specialist role.
      caps.push({ kind: "ReadCap" });
      caps.push({ kind: "SpecCap" });
      caps.push({ kind: "UserTalkCap" });
      break;

    case "architect":
      caps.push({ kind: "ReadCap" }, { kind: "GrepCap" }, { kind: "FindCap" }, { kind: "LsCap" });
      caps.push({ kind: "WebSearchCap", allowedDomains: ctx.webDomains });
      caps.push({ kind: "AdvisoryCap" });
      caps.push({ kind: "SpecCap" });
      break;

    case "pm":
      caps.push({ kind: "ReadCap" });
      caps.push({ kind: "SpecCap" });
      caps.push({ kind: "UserTalkCap" });
      break;

    case "scout":
      caps.push({ kind: "ReadCap" }, { kind: "GrepCap" }, { kind: "FindCap" }, { kind: "LsCap" });
      caps.push({ kind: "WebSearchCap", allowedDomains: ctx.webDomains });
      break;

    case "builder":
      if (!ctx.scopePath) {
        throw new Error("Builder envelope requires ctx.scopePath (the ticket's feature.scopePath)");
      }
      caps.push({ kind: "ReadCap" }, { kind: "GrepCap" }, { kind: "FindCap" }, { kind: "LsCap" });
      caps.push({ kind: "WriteCap", scope: ctx.scopePath });
      caps.push({ kind: "EditCap", scope: ctx.scopePath });
      caps.push({
        kind: "BashCap",
        cwd: ctx.cwd,
        allowedCommands: allowedBuilderCommands,
        timeoutMs: 120_000,
      });
      caps.push({ kind: "TestCap" });
      break;

    case "reviewer":
      caps.push({ kind: "ReadCap" }, { kind: "GrepCap" });
      caps.push({
        kind: "BashCap",
        cwd: ctx.cwd,
        allowedCommands: allowedReviewerCommands,
        timeoutMs: 60_000,
      });
      break;

    case "qa":
      caps.push({ kind: "ReadCap" });
      caps.push({
        kind: "BashCap",
        cwd: ctx.cwd,
        allowedCommands: allowedQaCommands,
        timeoutMs: 300_000, // QA runs may be longer
      });
      caps.push({ kind: "TestCap" });
      caps.push({ kind: "BrowserCap", allowedOrigins: ctx.browserOrigins });
      break;

    case "librarian":
      caps.push({ kind: "ReadCap" });
      caps.push({ kind: "MemoryWriteCap" });
      caps.push({
        kind: "BashCap",
        cwd: ctx.cwd,
        allowedCommands: allowedLibrarianCommands,
        timeoutMs: 60_000,
      });
      break;
  }

  return { role, capabilities: caps };
}
