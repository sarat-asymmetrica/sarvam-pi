// Sarvam-driven brief generation. The harness eats its own dogfood: when
// generating ticket briefs for downstream roles, we dispatch a PM subagent
// (Hopper + Angelou pair) to compose the brief from spec + feature + trail
// context. This is meta-PM work — translating raw context into operational
// intent for the next subagent in line.
//
// Falls back gracefully: if SARVAM_API_KEY is missing, dispatch fails, or
// the brief comes back empty, the caller substitutes a templated brief.
import { dispatchSubagent } from "../orchestrator/dispatch.js";
import { Feature } from "../features/types.js";
import { ProjectSpec } from "../spec/types.js";
import { RoleName } from "../roles/types.js";
import { TrailRecord } from "../trail/types.js";

export interface MetaBriefOptions {
  role: RoleName; // role the brief is FOR (not the brief generator)
  feature: Feature;
  spec: ProjectSpec | null;
  trailTail: TrailRecord[];
  cwd: string;
  timeoutMs?: number;
}

const VERB_FOR_ROLE: Record<RoleName, string> = {
  host: "Clarify",
  scout: "Discover",
  builder: "Implement",
  qa: "Verify",
  reviewer: "Review",
  architect: "Shape",
  pm: "Translate",
  librarian: "Compact",
};

function formatTrailTail(records: TrailRecord[]): string {
  if (records.length === 0) return "(no recent activity)";
  return records
    .slice(-6)
    .map((r) => {
      const ts = r.ts.slice(11, 19);
      const ctx = r.feature ? ` ${r.feature}` : "";
      const role = r.role ? ` [${r.role}]` : "";
      return `${ts} ${r.kind}${role}${ctx}`;
    })
    .join("\n");
}

export function buildMetaBrief(opts: Omit<MetaBriefOptions, "cwd" | "timeoutMs">): string {
  const { role, feature, spec, trailTail } = opts;
  const verb = VERB_FOR_ROLE[role];
  const stack = spec?.primaryStack.lang ?? "(unspecified)";
  const shape = spec?.appShape ?? "(unspecified)";
  const projectLine = spec
    ? `Project: ${spec.name} — ${spec.oneLineGoal}`
    : "Project: (no spec yet)";

  const historyLine =
    feature.history.length === 0
      ? "(new feature, no transitions yet)"
      : feature.history.map((h) => `${h.from}→${h.to}`).join(", ");

  return [
    `You are generating an operational ticket brief for a ${role} subagent on the Shoshin harness.`,
    "",
    projectLine,
    `Stack: ${stack}`,
    `App shape: ${shape}`,
    "",
    `Feature: "${feature.name}" (id: ${feature.id}, state: ${feature.state})`,
    `Scope: ${feature.scopePath ?? "(not yet set)"}`,
    `Recent history: ${historyLine}`,
    "",
    `Recent trail (last 6 records):`,
    formatTrailTail(trailTail),
    "",
    `Produce a 4–6 line ticket brief for the ${role} role. Lead with the operational`,
    `verb (${verb}). End with the concrete close condition for that role.`,
    "",
    `Rules:`,
    `- Plain prose, no markdown headers, no axiom recitation.`,
    `- Reference "${feature.name}" by exact name at least once.`,
    `- Do NOT include persona names — those are activated downstream.`,
    `- Output ONLY the brief, no preamble or commentary.`,
  ].join("\n");
}

// Strip common preamble/commentary the model might add despite instructions.
function cleanBrief(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  // Strip leading "Here is..." / "Here's..." / "Below is..." preambles
  const preamble = /^(here(?:'s| is| are)?|below is|this is)\s[^.\n]*[.:]?\s*\n?/i;
  let out = trimmed.replace(preamble, "");

  // Strip surrounding markdown fences if model wrapped output in ```
  out = out.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  // If the model produced multiple paragraphs separated by a "===" or similar,
  // take only the first chunk (the brief).
  const split = out.split(/\n\s*={3,}\s*\n/);
  if (split.length > 1 && split[0]!.trim().length > 50) {
    out = split[0]!;
  }

  return out.trim();
}

export interface BriefGenResult {
  ok: boolean;
  brief: string | null;
  durationMs: number;
  error?: string;
}

// Dispatch a PM subagent with the meta-brief. Returns a cleaned brief or null
// on failure. NEVER throws — caller is expected to fall back to a template.
export async function generateBriefViaSarvam(
  opts: MetaBriefOptions,
): Promise<BriefGenResult> {
  if (!process.env.SARVAM_API_KEY) {
    return { ok: false, brief: null, durationMs: 0, error: "SARVAM_API_KEY not set" };
  }

  const metaBrief = buildMetaBrief({
    role: opts.role,
    feature: opts.feature,
    spec: opts.spec,
    trailTail: opts.trailTail,
  });

  const startedAt = Date.now();
  try {
    const result = await dispatchSubagent({
      role: "pm",
      ticketBrief: metaBrief,
      spec: opts.spec,
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs ?? 90_000,
    });

    if (!result.ok) {
      return {
        ok: false,
        brief: null,
        durationMs: Date.now() - startedAt,
        error: result.error ?? `dispatch failed (exit ${result.exitCode})`,
      };
    }

    const cleaned = cleanBrief(result.output);
    if (!cleaned) {
      return {
        ok: false,
        brief: null,
        durationMs: Date.now() - startedAt,
        error: "PM returned empty brief",
      };
    }

    // Sanity floor: too short = probably not a real brief.
    if (cleaned.length < 30) {
      return {
        ok: false,
        brief: null,
        durationMs: Date.now() - startedAt,
        error: `PM brief too short (${cleaned.length} chars): ${cleaned}`,
      };
    }

    return {
      ok: true,
      brief: cleaned,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      ok: false,
      brief: null,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
