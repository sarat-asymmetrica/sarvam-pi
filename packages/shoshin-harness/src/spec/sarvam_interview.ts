// Multi-turn discovery interview, host-led, language-aware.
//
// Replaces the canned 12-question English interview with a warm
// conversation where the host (Tagore + Carl Rogers + Asya pillars)
// asks ONE question at a time, in the user's language, and builds
// the spec progressively. Loop ends when:
//   1. Host emits `<<<DISCOVERY_COMPLETE>>>` followed by a JSON spec
//   2. User types `/done` (host wraps up with whatever it has)
//   3. Max turns reached (foundation-phase safety bound = 12)
//
// Each turn is threaded through Pi's native session machinery. The local
// transcript remains the audit log, but dispatch sends only the new turn so
// prompt cost stays flat as interviews grow.
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import kleur from "kleur";
import { dispatchSubagent } from "../orchestrator/dispatch.js";
import { ProjectSpec, ProjectSpecSchema } from "./types.js";
import { logTrail } from "../trail/writer.js";
import { bumpTurn } from "../time/pulse.js";
import { appendJsonl } from "../util/json-io.js";
import { shoshinDir } from "../util/paths.js";
import { join } from "node:path";

// ---------------------------------------------------------------------
// Language detection - script-based, deterministic, O(1)
// ---------------------------------------------------------------------

export type Language =
  | "en"     // English / Indian English
  | "hi"     // Hindi
  | "mr"     // Marathi (Devanagari, distinguished from Hindi by lexicon)
  | "ta"     // Tamil
  | "te"     // Telugu
  | "kn"     // Kannada
  | "bn"     // Bengali
  | "gu"     // Gujarati
  | "pa";    // Punjabi (Gurmukhi)

const SCRIPT_RANGES: { lang: Language; test: (s: string) => boolean }[] = [
  { lang: "ta", test: (s) => /[\u0B80-\u0BFF]/.test(s) },
  { lang: "te", test: (s) => /[\u0C00-\u0C7F]/.test(s) },
  { lang: "kn", test: (s) => /[\u0C80-\u0CFF]/.test(s) },
  { lang: "bn", test: (s) => /[\u0980-\u09FF]/.test(s) },
  { lang: "gu", test: (s) => /[\u0A80-\u0AFF]/.test(s) },
  { lang: "pa", test: (s) => /[\u0A00-\u0A7F]/.test(s) },
];

// Common Marathi-only function words / inflections that distinguish from Hindi.
// (Both languages use Devanagari; this is a lexical disambiguator.)
//
// Note: regex \b doesn't work on Devanagari characters; \b only triggers on
// transitions between Latin word chars [A-Za-z0-9_] and non-word chars. So we
// match these as plain substrings; false positives here are vanishingly rare
// because these tokens are highly specific to Marathi morphology.
const MARATHI_MARKERS = [
  "\u0906\u0939\u0947",
  "\u092E\u0932\u093E",
  "\u0924\u0941\u092E\u094D\u0939\u0940",
  "\u0915\u093E\u092F",
  "\u0906\u092E\u091A\u094D\u092F\u093E",
  "\u092E\u093E\u091D\u094D\u092F\u093E",
  "\u0917\u091F",
  "\u092C\u0918\u093E",
  "\u0915\u0930\u093E\u092F\u091A\u0947",
];

export function detectLanguage(text: string): Language {
  for (const { lang, test } of SCRIPT_RANGES) {
    if (test(text)) return lang;
  }
  // Devanagari? Disambiguate Hindi vs Marathi.
  if (/[\u0900-\u097F]/.test(text)) {
    const marathiHits = MARATHI_MARKERS.filter((marker) => text.includes(marker)).length;
    return marathiHits >= 1 ? "mr" : "hi";
  }
  return "en";
}

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English (Indian English register is welcome)",
  hi: "Hindi (Devanagari script; natural Hindi-English code-mixing is fine - do NOT force shudh Hindi)",
  mr: "Marathi (Devanagari script; warm conversational Marathi as a Marathi-speaking elder would use)",
  ta: "Tamil (Tamil script; natural Tamil-English code-mixing is fine)",
  te: "Telugu (Telugu script)",
  kn: "Kannada (Kannada script)",
  bn: "Bengali (Bengali script)",
  gu: "Gujarati (Gujarati script)",
  pa: "Punjabi (Gurmukhi script)",
};

// ---------------------------------------------------------------------
// Conversation transcript types
// ---------------------------------------------------------------------

export interface ConversationTurn {
  who: "host" | "user";
  text: string;
  ts: string; // ISO
}

export interface DiscoveryResult {
  spec: ProjectSpec | null;
  transcript: ConversationTurn[];
  language: Language;
  turns: number;
  reason: "complete" | "user_done" | "max_turns" | "error";
  error?: string;
}

// ---------------------------------------------------------------------
// Brief construction - what we send the host on each turn
// ---------------------------------------------------------------------

const REQUIRED_FIELDS = [
  "name",
  "oneLineGoal",
  "primaryUser",
  "primaryStack.lang",
  "appShape",
] as const;

function buildTurnBrief(
  language: Language,
  transcript: ConversationTurn[],
  isFinalTurn: boolean,
  retryUrgent: boolean = false,
): string {
  const langName = LANGUAGE_NAMES[language];
  const userTurnCount = transcript.filter((t) => t.who === "user").length;

  const latestUserTurn = [...transcript].reverse().find((t) => t.who === "user");

  const lines = [
    "You are conducting a warm discovery interview to build a ProjectSpec for a new app.",
    "",
    `RESPOND ENTIRELY IN ${language.toUpperCase()}: ${langName}`,
    "",
    "DISCIPLINE (critical):",
    "- Ask EXACTLY ONE question per turn. Never batch.",
    "- Mirror the user's words before structuring (Carl Rogers move).",
    "- Match the user's register and energy. If they're uncertain, be reassuring.",
    "  If they're confident, be efficient.",
    "- Never make the user feel they need to know technical terms. They don't.",
    "- The structured spec is YOUR job; the user's job is to share their vision.",
    "",
    "REQUIRED FIELDS to discover (look at conversation history above; you decide what's still missing):",
    "  - name             project slug (kebab-case; you propose, user confirms)",
    "  - oneLineGoal      one-sentence description of what the app does, for whom",
    "  - primaryUser      who will use this (plain language, the user's words)",
    "  - primaryStack.lang  language: go | ts | py (suggest based on goal - for mobile/web, prefer 'ts')",
    "  - appShape         cli | desktop | web | api | mobile (infer from context)",
    "",
    "OPTIONAL FIELDS (ask only if naturally surfaced; don't interrogate):",
    "  - surfaces         cli | telegram | miniapp | pwa | desktop | voice",
    "  - mathPrimitives   digital_root, regime_classifier, etc.",
    "  - targetLanguages  language codes the app should support (e.g. ['en','hi'])",
    "  - notes            anything the user wants captured",
    "",
    "SESSION CONTEXT:",
    "The prior conversation is already present in the Pi session. Do not ask the user to repeat it.",
    "",
    "LATEST USER MESSAGE:",
    latestUserTurn ? latestUserTurn.text : "(this is the first turn - open with a warm welcome)",
    "",
    `(${userTurnCount} user turn${userTurnCount === 1 ? "" : "s"} so far)`,
    "",
    "--- YOUR TURN ---",
  ];

  if (retryUrgent) {
    lines.push(
      "URGENT: Your previous response did NOT include the <<<DISCOVERY_COMPLETE>>> marker.",
      "You MUST output the marker AND the JSON spec NOW. No more questions.",
      "Use the conversation above to infer all required fields. Make conservative",
      "guesses for any field that is genuinely unclear (note the guess in 'notes').",
      "",
      "Output ONLY this format, nothing else:",
      "",
      "<<<DISCOVERY_COMPLETE>>>",
      "```json",
      "{",
      '  "name": "kebab-case-slug",',
      '  "oneLineGoal": "...",',
      '  "primaryUser": "...",',
      '  "primaryStack": { "lang": "go" },',
      '  "appShape": "cli",',
      '  "targetLanguages": ["en"],',
      '  "notes": "..."',
      "}",
      "```",
    );
  } else if (isFinalTurn) {
    lines.push(
      "FINAL TURN - the user signalled /done OR we have enough info to wrap up.",
      "",
      "Do TWO things now:",
      "1. A warm, brief, language-matched closing (1-2 sentences) - thank the user, name the project back to them.",
      "2. On a new line, output EXACTLY this marker followed by the full ProjectSpec JSON:",
      "",
      "<<<DISCOVERY_COMPLETE>>>",
      "```json",
      "{",
      '  "name": "kebab-case-slug",',
      '  "oneLineGoal": "one-sentence description in the user\'s words",',
      '  "primaryUser": "who uses this, in plain language",',
      '  "primaryStack": { "lang": "go|ts|py" },',
      '  "appShape": "cli|desktop|web|api|mobile",',
      '  "targetLanguages": ["en"],',
      '  "notes": "any guesses you made, optional"',
      "}",
      "```",
      "",
      "The JSON keys are English (machine-readable). Free-text VALUES (oneLineGoal, primaryUser,",
      "notes) keep the user's actual language - Marathi/Hindi/etc. - verbatim. Do NOT translate.",
      "",
      "If a required field is genuinely unclear, make a conservative best-guess and note it in 'notes'.",
      "DO NOT ask another question. The interview is closing.",
    );
  } else {
    lines.push(
      "Look at the conversation above. If you have collected enough information for ALL the required",
      "fields (name, oneLineGoal, primaryUser, primaryStack.lang, appShape), emit the completion now:",
      "",
      "<<<DISCOVERY_COMPLETE>>>",
      "```json",
      "{ ...full spec JSON... }",
      "```",
      "",
      "Otherwise, ask ONE concrete question that surfaces the most important still-missing field.",
      "If the user's previous turn was vague, mirror it back and ask for one specific detail.",
      "If the user said something that LETS YOU INFER a field, name your inference back for confirmation",
      "rather than re-asking (e.g. 'It sounds like this would run on Android - should I plan it as a mobile app?').",
      "",
      "If you ask a question, output ONLY the question in plain prose. No JSON, no markdown headers, no code blocks.",
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------
// Spec extraction from host response
// ---------------------------------------------------------------------

const COMPLETE_MARKER = "<<<DISCOVERY_COMPLETE>>>";

function extractSpec(hostResponse: string): {
  hostMessage: string;
  specJson: string | null;
} {
  const idx = hostResponse.indexOf(COMPLETE_MARKER);
  if (idx === -1) return { hostMessage: hostResponse.trim(), specJson: null };

  const hostMessage = hostResponse.slice(0, idx).trim();
  const after = hostResponse.slice(idx + COMPLETE_MARKER.length);

  // Pull the first JSON code-block (or first { ... } balanced block).
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(after);
  if (fenced) return { hostMessage, specJson: fenced[1]!.trim() };

  // Fallback: find balanced braces.
  const braceStart = after.indexOf("{");
  if (braceStart === -1) return { hostMessage, specJson: null };
  let depth = 0;
  for (let i = braceStart; i < after.length; i++) {
    if (after[i] === "{") depth++;
    else if (after[i] === "}") {
      depth--;
      if (depth === 0) {
        return { hostMessage, specJson: after.slice(braceStart, i + 1) };
      }
    }
  }
  return { hostMessage, specJson: null };
}

function tryParseSpec(jsonStr: string): { spec: ProjectSpec | null; error?: string } {
  try {
    const raw = JSON.parse(jsonStr);
    raw.source = raw.source ?? "interview";
    raw.createdAt = raw.createdAt ?? new Date().toISOString();
    const parsed = ProjectSpecSchema.parse(raw);
    return { spec: parsed };
  } catch (err) {
    return {
      spec: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------
// Stigmergy: append every turn to discovery_session.jsonl
// ---------------------------------------------------------------------

function logTurnToSession(
  cwd: string,
  turn: ConversationTurn,
  language: Language,
): void {
  try {
    const path = join(shoshinDir(cwd), "discovery_session.jsonl");
    appendJsonl(path, { ...turn, language });
  } catch {
    // Best-effort logging - never break the interview on log failure.
  }
}

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------

const MAX_TURNS = 12; // safety bound; usually completes in 4-7

export interface SarvamInterviewOpts {
  cwd: string;
  timeoutMsPerTurn?: number;
  scriptedAnswers?: string[]; // for smoke testing (skip readline)
}

export async function runSarvamInterview(
  opts: SarvamInterviewOpts,
): Promise<DiscoveryResult> {
  const transcript: ConversationTurn[] = [];
  let language: Language = "en";

  const useScripted = Array.isArray(opts.scriptedAnswers);
  const scriptIter = useScripted
    ? opts.scriptedAnswers!.values()
    : null;
  const rl = useScripted
    ? null
    : readline.createInterface({ input, output });

  console.log(
    kleur.cyan(
      "\nDiscovery - let's build your project together.\n" +
        "    The host will ask one question at a time. Type /done when you want to wrap up.\n",
    ),
  );

  let turnCount = 0;
  let result: DiscoveryResult = {
    spec: null,
    transcript,
    language,
    turns: 0,
    reason: "max_turns",
  };

  try {
    for (turnCount = 0; turnCount < MAX_TURNS; turnCount++) {
      const isLastSafetyTurn = turnCount === MAX_TURNS - 1;

      // 1. Host turn (dispatch with current state)
      bumpTurn();
      const brief = buildTurnBrief(language, transcript, isLastSafetyTurn);
      const hostResult = await dispatchSubagent({
        role: "host",
        ticketBrief: brief,
        spec: null, // no existing spec yet - that's what we're building
        cwd: opts.cwd,
        timeoutMs: opts.timeoutMsPerTurn ?? 90_000,
        sessionKey: "discovery-host",
      });

      if (!hostResult.ok) {
        result.reason = "error";
        result.error = hostResult.error ?? "host dispatch failed";
        break;
      }

      const { hostMessage, specJson } = extractSpec(hostResult.output);

      if (hostMessage) {
        const ts = new Date().toISOString();
        transcript.push({ who: "host", text: hostMessage, ts });
        logTurnToSession(opts.cwd, { who: "host", text: hostMessage, ts }, language);
        console.log(kleur.cyan("\n---- host ----\n"));
        console.log(hostMessage);
      }

      // 2. Did the host emit the complete marker? Validate and exit.
      if (specJson) {
        const parsed = tryParseSpec(specJson);
        if (parsed.spec) {
          result.spec = parsed.spec;
          result.reason = "complete";
          result.turns = turnCount + 1;
          break;
        } else {
          // Validation failed - surface and ask host to fix on next turn.
          console.log(
            kleur.yellow(
              `\n  (host emitted complete marker but spec failed validation: ${parsed.error})`,
            ),
          );
          // Treat as an internal correction turn - append a synthetic user prompt
          // asking the host to retry with corrections.
          const correction: ConversationTurn = {
            who: "user",
            text: `(spec validation error: ${parsed.error}. please re-emit the JSON with the missing/incorrect fields fixed.)`,
            ts: new Date().toISOString(),
          };
          transcript.push(correction);
          continue;
        }
      }

      // 3. User turn (read input or scripted)
      let userText: string;
      if (useScripted) {
        const next = scriptIter!.next();
        if (next.done) {
          // Out of scripted answers - request final close.
          userText = "/done";
        } else {
          userText = next.value;
        }
      } else {
        process.stdout.write(kleur.green("\n---- you (enter to send, /done to finish) ----\n"));
        userText = ((await rl!.question("> ")) ?? "").trim();
      }

      if (!userText) {
        console.log(kleur.gray("(empty input - ending interview)"));
        result.reason = "user_done";
        break;
      }

      const ts = new Date().toISOString();
      transcript.push({ who: "user", text: userText, ts });
      logTurnToSession(opts.cwd, { who: "user", text: userText, ts }, language);
      logTrail({
        kind: "user_prompt",
        promptDigest:
          userText.length > 200 ? `${userText.slice(0, 200)}...` : userText,
      });

      // Detect language from the FIRST substantive user turn.
      if (turnCount === 0) {
        language = detectLanguage(userText);
        console.log(
          kleur.gray(`\n  (detected language: ${language})`),
        );
      }

      // /done -> push host into final-turn mode (one extra dispatch + one
      // optional urgent-retry if the host fails to emit the marker).
      if (/^\/done$/i.test(userText.trim())) {
        const dispatchFinal = async (urgent: boolean) => {
          const brief = buildTurnBrief(language, transcript, true, urgent);
          return dispatchSubagent({
            role: "host",
            ticketBrief: brief,
            spec: null,
            cwd: opts.cwd,
            timeoutMs: opts.timeoutMsPerTurn ?? 90_000,
            sessionKey: "discovery-host",
          });
        };

        for (let attempt = 0; attempt < 2; attempt++) {
          const r = await dispatchFinal(attempt === 1);
          if (!r.ok) continue;
          const { hostMessage: hm, specJson: sj } = extractSpec(r.output);
          if (hm) {
            transcript.push({
              who: "host",
              text: hm,
              ts: new Date().toISOString(),
            });
            // Only print on first (warm) attempt - second attempt is mechanical retry.
            if (attempt === 0) {
              console.log(kleur.cyan("\n---- host ----\n"));
              console.log(hm);
            }
          }
          if (sj) {
            const parsed = tryParseSpec(sj);
            if (parsed.spec) {
              result.spec = parsed.spec;
              result.reason = "user_done";
              result.turns = turnCount + 1;
              break;
            }
          }
        }

        // If we got a spec from one of the attempts, exit; else exit no-spec.
        if (result.spec) break;
        result.reason = "user_done";
        result.turns = turnCount + 1;
        break;
      }

      // 4. Update draft spec from accumulated context. We don't try to parse
      //    fields out of the user's prose ourselves - we trust the host to
      //    accumulate them in the next emitted JSON. The draft spec is a
      //    HINT to the host about what's missing; the authoritative spec
      //    comes from the final marker emission.
      //    BUT: we do simple field updates if the user clearly named a project.
      // (Foundation phase: leave this to host. Future: extract eagerly.)
    }

    if (result.turns === 0) result.turns = turnCount;
    result.language = language;
  } finally {
    rl?.close();
  }

  return result;
}
