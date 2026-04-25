// Compose a complete system prompt for a role-subagent: persona pair activation +
// role concern + envelope summary + project spec brief + memory bundle + time pulse.
//
// The output is what gets handed to the spawned Sarvam subagent as its system prompt.
import { ProjectSpec, summarizeSpec } from "../spec/types.js";
import { getRole } from "./catalog.js";
import { activatePair } from "../personas/catalog.js";
import { RoleName } from "./types.js";

export interface SystemPromptOptions {
  role: RoleName;
  spec?: ProjectSpec | null;
  ticketBrief?: string;
  scopePath?: string;
  memoryBundle?: string; // TOON-encoded relevant memory
  timePulse?: string; // single-line current pulse
  trailTail?: string; // last-N trail records as plain text
}

export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const role = getRole(opts.role);
  const sections: string[] = [];

  sections.push(activatePair(role.personaPair[0], role.personaPair[1]));
  sections.push(`Working as: **${role.name.toUpperCase()}**`);
  sections.push(role.promptTemplate);
  sections.push(
    `Capability envelope: ${role.defaultEnvelope.join(", ")}.\n` +
      `Operations outside this envelope are not available — do not attempt them.`,
  );

  if (opts.spec) {
    sections.push(["Project spec:", "```", summarizeSpec(opts.spec), "```"].join("\n"));
  }

  if (opts.scopePath) {
    sections.push(`Scope: you may write/edit ONLY under \`${opts.scopePath}\`. Reads are unrestricted.`);
  }

  if (opts.ticketBrief) {
    sections.push(["Ticket:", opts.ticketBrief].join("\n"));
  }

  if (opts.memoryBundle) {
    sections.push(["Relevant memory (compact):", "```", opts.memoryBundle, "```"].join("\n"));
  }

  if (opts.trailTail) {
    sections.push(["Recent trail (substrate context):", "```", opts.trailTail, "```"].join("\n"));
  }

  if (opts.timePulse) {
    sections.push(`Time pulse: ${opts.timePulse}`);
  }

  return sections.join("\n\n");
}
