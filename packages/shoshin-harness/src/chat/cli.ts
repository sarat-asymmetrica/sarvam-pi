// `shoshin chat` — one-shot warm conversation with the host role.
//
// The host (Tagore + Carl Rogers persona pair, layered with Asya pillars)
// is the user-facing concierge. Reads spec/trail context, mirrors the
// user's words back, and proposes ONE next step — never silent dispatch.
//
// Foundation phase: single round-trip. Future: multi-turn session with
// readline + stigmergy continuity (chat_session.jsonl).
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import kleur from "kleur";
import { dispatchSubagent } from "../orchestrator/dispatch.js";
import { readSpec } from "../spec/store.js";
import { logTrail } from "../trail/writer.js";
import { bumpTurn, logPulseIfDue } from "../time/pulse.js";

export interface ChatOpts {
  question?: string; // if omitted, prompt interactively
  timeoutSec?: string;
}

function digestForTrail(text: string, max = 200): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

async function readQuestion(): Promise<string> {
  console.log(
    kleur.cyan("\n👋 Namaste — what's on your mind?\n") +
      kleur.gray("   (anything: a question, a half-formed idea, a blocker. Press enter twice to send.)\n"),
  );
  const rl = readline.createInterface({ input, output });
  const lines: string[] = [];
  let blank = 0;
  for await (const line of rl) {
    if (line.trim() === "") {
      blank++;
      if (blank >= 1 && lines.length > 0) break;
      if (blank >= 2) break;
    } else {
      blank = 0;
      lines.push(line);
    }
  }
  rl.close();
  return lines.join("\n").trim();
}

export async function runChat(opts: ChatOpts): Promise<void> {
  const cwd = process.cwd();
  const timeoutMs = Math.max(10, parseInt(opts.timeoutSec ?? "120", 10) || 120) * 1000;

  const question = opts.question?.trim() || (await readQuestion());
  if (!question) {
    console.log(kleur.gray("(empty input — nothing to ask)"));
    return;
  }

  if (!process.env.SARVAM_API_KEY) {
    console.error(
      kleur.red("✗ shoshin chat requires SARVAM_API_KEY (the host calls Sarvam 105B)."),
    );
    console.error(kleur.gray("  Set the key in sarvam-pi/.env or your shell environment."));
    process.exit(2);
  }

  const spec = (() => {
    try {
      return readSpec(cwd);
    } catch {
      return null;
    }
  })();

  bumpTurn();
  logPulseIfDue(3, cwd);

  // Capture the user's prompt in the trail BEFORE dispatching, so the
  // record exists even if the dispatch fails or times out.
  logTrail({
    kind: "user_prompt",
    promptDigest: digestForTrail(question),
  });

  console.log(kleur.gray(`\n  (host is listening...)`));
  const start = Date.now();
  const result = await dispatchSubagent({
    role: "host",
    ticketBrief: [
      "A user is talking to you directly. Their message is below the divider.",
      "",
      "Receive their words first — mirror what you heard if it would help them",
      "feel seen. Answer if you can; otherwise propose ONE next concrete action",
      "(e.g. 'should I draft a feature for this?' / 'want me to ask the Scout to",
      "look around?'). Never silently dispatch — name the role you'd hand off to.",
      "",
      "If the question is technical and you have the context to answer, answer",
      "directly. If it's about the project, ground in the spec.",
      "",
      "─── User says: ───",
      question,
    ].join("\n"),
    spec,
    cwd,
    timeoutMs,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!result.ok) {
    console.error(kleur.red(`\n✗ host dispatch failed after ${elapsed}s:`));
    console.error(kleur.gray(`  ${result.error ?? "unknown error"}`));
    process.exit(3);
  }

  console.log(kleur.cyan("\n──────────── host says ────────────\n"));
  console.log(result.output);
  console.log(kleur.gray(`\n  (responded in ${elapsed}s)\n`));
}
