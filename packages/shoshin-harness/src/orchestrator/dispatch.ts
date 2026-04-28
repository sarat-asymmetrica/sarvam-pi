// Orchestrator dispatch. Spawns a child Pi process running Sarvam with the
// envelope-restricted tool set and the persona-pair-activated system prompt.
//
// This is the chokepoint where Shoshin product layer meets the engine layer.
// All role subagent invocations go through here.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectSpec } from "../spec/types.js";
import { RoleName } from "../roles/types.js";
import { buildSystemPrompt } from "../roles/prompt-builder.js";
import { envelopeForRole } from "../capabilities/role-envelopes.js";
import { envelopeSummary, toPiPlan, toolContractForPrompt } from "../capabilities/to-pi-tools.js";
import { hydrateMemory } from "../memory/hydrate.js";
import { currentPulse, pulseLine } from "../time/pulse.js";
import { readTrailTail } from "../trail/reader.js";
import { Trail, logTrail } from "../trail/writer.js";
import { readStoredSessionId, writeStoredSessionId } from "./session-store.js";

export interface DispatchOptions {
  role: RoleName;
  ticketBrief: string;
  scopePath?: string; // required for builder; optional otherwise
  spec: ProjectSpec | null;
  cwd: string;
  timeoutMs?: number;
  extraSystemPromptHints?: string[];
  sessionKey?: string;
  synthesisOnly?: boolean;
}

export interface ProcessDispatchOptions {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  role?: RoleName;
}

export interface DispatchTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface DispatchResult {
  ok: boolean;
  output: string;
  durationMs: number;
  exitCode: number | null;
  error?: string;
  piSessionId?: string;
  sessionFile?: string;
  tokens?: DispatchTokens;
}

interface PiJsonHeader {
  type: "session";
  id?: string;
  sessionFile?: string;
}

interface PiPrintResult {
  type: "print_result";
  text?: string;
  exitCode?: number;
}

interface PiSessionSummary {
  type: "session_summary";
  sessionId?: string;
  sessionFile?: string;
  durationMs?: number;
  tokens?: DispatchTokens;
  cost?: number;
}

interface ParsedPiJsonOutput {
  text: string;
  header?: PiJsonHeader;
  summary?: PiSessionSummary;
  nonJson: string[];
}

const SARVAM_PI_ROOT = resolve(
  process.env.SARVAM_PI_ROOT ?? "C:/Projects/sarvam-pi",
);
const SYNTHESIS_ORIGINAL_BRIEF_LIMIT = 2_500;
const SYNTHESIS_TOOL_ECHO_LIMIT = 800;

function locatePiCli(): string {
  const candidate = join(SARVAM_PI_ROOT, "pi-mono", "packages", "coding-agent", "dist", "cli.js");
  if (!existsSync(candidate)) {
    throw new Error(
      `Pi CLI not found at ${candidate}. Set SARVAM_PI_ROOT to the sarvam-pi repo root.`,
    );
  }
  return candidate;
}

function locateSarvamProvider(): string {
  const candidate = join(SARVAM_PI_ROOT, "packages", "sarvam-provider", "index.ts");
  if (!existsSync(candidate)) {
    throw new Error(
      `sarvam-provider not found at ${candidate}. Set SARVAM_PI_ROOT to the sarvam-pi repo root.`,
    );
  }
  return candidate;
}

function parsePiJsonOutput(stdout: string): ParsedPiJsonOutput {
  const nonJson: string[] = [];
  let header: PiJsonHeader | undefined;
  let result: PiPrintResult | undefined;
  let summary: PiSessionSummary | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as { type?: string };
      if (event.type === "session") {
        header = event as PiJsonHeader;
      } else if (event.type === "print_result") {
        result = event as PiPrintResult;
      } else if (event.type === "session_summary") {
        summary = event as PiSessionSummary;
      }
    } catch {
      nonJson.push(line);
    }
  }

  return {
    text: result?.text ?? nonJson.join("\n").trim(),
    header,
    summary,
    nonJson,
  };
}

export async function dispatchSubagent(opts: DispatchOptions): Promise<DispatchResult> {
  const env = envelopeForRole(opts.role, {
    scopePath: opts.scopePath,
    cwd: opts.cwd,
  });
  const plan = opts.synthesisOnly ? { toolsArg: "", envOverrides: {} } : toPiPlan(env);

  const memBundle = hydrateMemory({ cwd: opts.cwd, spec: opts.spec });
  const pulse = currentPulse(opts.cwd);
  const trailTail = readTrailTail(8, opts.cwd)
    .map((r) => `${r.ts.slice(0, 19)} ${r.kind} ${(r as any).feature ?? ""}`)
    .join("\n");

  const systemPrompt = buildSystemPrompt({
    role: opts.role,
    spec: opts.spec,
    ticketBrief: opts.ticketBrief,
    scopePath: opts.scopePath,
    memoryBundle: memBundle.bundle,
    timePulse: pulseLine(pulse),
    trailTail,
    toolContract: toolContractForPrompt(env, plan),
    capabilitySummary: envelopeSummary(env),
  });

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...plan.envOverrides,
  };

  const cliPath = locatePiCli();
  const providerPath = locateSarvamProvider();
  const storedSessionId = readStoredSessionId(opts.cwd, opts.sessionKey);

  // The child Pi process gets:
  //   --provider sarvam --model sarvam-105b
  //   --tools <comma-separated tools allowed by envelope>
  //   --mode json, with --session <id> after the first call for a session key
  //   <prompt> as a single argument; we put the system prompt + ticket brief inline
  const finalPrompt = [
    systemPrompt,
    "",
    "=== Child-agent protocol ===",
    "- Complete this in print mode.",
    "- Do not wait for user input.",
    "- Do not start an interactive conversation.",
    opts.synthesisOnly
      ? "- Tool use is closed for this follow-up. Produce a normal final answer from the existing session context."
      : "- Use tools only when needed, then synthesize a normal final answer.",
    "- A tool-call echo is not a final answer. Do not end with 'Called tool ...'.",
    "- Final answer format: changed files (or files inspected), verification/result, and any remaining caveat.",
    "- Once you have enough context, stop using tools and provide that final answer.",
    "",
    `=== Ticket ===`,
    opts.ticketBrief,
  ].join("\n");

  const args = [
    cliPath,
    "-e",
    providerPath,
    "--provider",
    "sarvam",
    "--model",
    "sarvam-105b",
    "--mode",
    "json",
  ];
  if (storedSessionId) {
    args.push("--session", storedSessionId);
  }
  if (plan.toolsArg) {
    args.push("--tools", plan.toolsArg);
  }
  args.push(finalPrompt);

  Trail.spawn(opts.role, opts.ticketBrief.slice(0, 120), env.capabilities.map((c) => c.kind));

  const startedAt = Date.now();
  return new Promise<DispatchResult>((resolveOuter) => {
    const child = spawn(process.execPath, args, {
      cwd: opts.cwd,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timeoutMs = opts.timeoutMs ?? 240_000;
    const timeout = setTimeout(() => {
      Trail.processHygiene(
        "timeout_kill",
        child.pid ?? null,
        [process.execPath, ...args].join(" "),
        Date.now() - startedAt,
        `dispatch timed out after ${timeoutMs}ms`,
      );
      killProcessTree(child.pid);
      const elapsed = Date.now() - startedAt;
      Trail.failed(opts.role, `timeout after ${timeoutMs}ms`);
      resolveOuter({
        ok: false,
        output: stdout || "[no output]",
        durationMs: elapsed,
        exitCode: null,
        error: `timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      Trail.failed(opts.role, err.message);
      resolveOuter({
        ok: false,
        output: stdout,
        durationMs: Date.now() - startedAt,
        exitCode: null,
        error: err.message,
      });
    });
    child.on("close", async (code) => {
      clearTimeout(timeout);
      const elapsed = Date.now() - startedAt;
      const ok = code === 0;
      const parsed = parsePiJsonOutput(stdout);
      const trimmed = parsed.text.trim();
      const piSessionId = parsed.summary?.sessionId ?? parsed.header?.id;
      const sessionFile = parsed.summary?.sessionFile ?? parsed.header?.sessionFile;
      if (opts.sessionKey && piSessionId) {
        writeStoredSessionId(opts.cwd, opts.sessionKey, piSessionId);
      }
      const digest = trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
      if (ok) {
        if (!opts.synthesisOnly && isToolCallEcho(trimmed) && opts.sessionKey) {
          Trail.processHygiene(
            "tool_echo_synthesis",
            child.pid ?? null,
            opts.role,
            elapsed,
            "Pi print-mode returned a tool-call echo as the final answer; requesting same-session no-tools synthesis",
          );
          const synthesis = await dispatchSubagent({
            ...opts,
            ticketBrief: synthesisBrief(opts.ticketBrief, trimmed),
            synthesisOnly: true,
          });
          resolveOuter({
            ...synthesis,
            durationMs: elapsed + synthesis.durationMs,
            piSessionId: synthesis.piSessionId ?? piSessionId,
            sessionFile: synthesis.sessionFile ?? sessionFile,
            tokens: synthesis.tokens ?? parsed.summary?.tokens,
          });
          return;
        }
        if (opts.synthesisOnly && isToolCallEcho(trimmed)) {
          Trail.failed(opts.role, "tool-call echo remained after synthesis pass");
          resolveOuter({
            ok: false,
            output: trimmed,
            durationMs: elapsed,
            exitCode: code,
            error: "tool-call echo remained after synthesis pass",
            piSessionId,
            sessionFile,
            tokens: parsed.summary?.tokens,
          });
          return;
        }
        Trail.complete(opts.role, elapsed, digest);
        if (parsed.summary?.tokens) {
          Trail.sessionSummary(
            opts.role,
            piSessionId ?? null,
            sessionFile ?? null,
            parsed.summary.durationMs ?? elapsed,
            parsed.summary.tokens,
            parsed.summary.cost ?? null,
          );
        }
      } else {
        Trail.failed(opts.role, `exit ${code}: ${stderr.slice(0, 200)}`);
      }
      const jsonError = parsed.nonJson.join("\n").slice(0, 500);
      resolveOuter({
        ok,
        output: trimmed,
        durationMs: elapsed,
        exitCode: code,
        error: ok ? undefined : `exit ${code}: ${stderr.slice(0, 500) || jsonError}`,
        piSessionId,
        sessionFile,
        tokens: parsed.summary?.tokens,
      });
    });
  });
}

export function isToolCallEcho(output: string): boolean {
  const text = output.trim();
  if (!text) return false;
  return /^Called tool [A-Za-z0-9_-]+ with arguments [\s\S]+\.?$/i.test(text);
}

export function isWeakFinalAnswer(output: string): boolean {
  const text = output.trim();
  if (!text) return true;
  if (text.length < 24) return true;
  if (/^(done|fixed|ok|okay|completed|success|successful|implemented|verified|passed)\.?$/i.test(text)) return true;
  return false;
}

export function synthesisBrief(originalBrief: string, toolEcho: string): string {
  return [
    "The previous turn executed a tool but returned only a tool-call echo instead of a final answer.",
    "Do not call any tools in this follow-up.",
    "Read the existing session context and synthesize a normal final response.",
    "Your final answer must not be a tool-call echo or a one-word status.",
    "Use this exact structure:",
    "Changed files: <paths, or none>",
    "Verification: <command/check/gate result, or not run>",
    "Notes: <remaining caveat, or none>",
    "",
    "Original ticket:",
    compactPromptText(originalBrief, SYNTHESIS_ORIGINAL_BRIEF_LIMIT),
    "",
    "Previous tool-call echo:",
    compactPromptText(toolEcho, SYNTHESIS_TOOL_ECHO_LIMIT),
  ].join("\n");
}

export function compactPromptText(text: string, limit: number): string {
  const normalized = text.trim();
  if (normalized.length <= limit) return normalized;
  const marker = `\n\n[...${normalized.length - limit} chars omitted...]\n\n`;
  const headLength = Math.max(0, Math.ceil((limit - marker.length) * 0.6));
  const tailLength = Math.max(0, limit - marker.length - headLength);
  return `${normalized.slice(0, headLength).trimEnd()}${marker}${normalized.slice(-tailLength).trimStart()}`;
}

export async function dispatchProcessForTest(opts: ProcessDispatchOptions): Promise<DispatchResult> {
  const startedAt = Date.now();
  return new Promise<DispatchResult>((resolveOuter) => {
    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const commandText = [opts.command, ...opts.args].join(" ");
    const timeout = setTimeout(() => {
      Trail.processHygiene(
        "timeout_kill",
        child.pid ?? null,
        commandText,
        Date.now() - startedAt,
        `test process timed out after ${opts.timeoutMs}ms`,
      );
      killProcessTree(child.pid);
      resolveOuter({
        ok: false,
        output: stdout || "[no output]",
        durationMs: Date.now() - startedAt,
        exitCode: null,
        error: `timed out after ${opts.timeoutMs}ms`,
      });
    }, opts.timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      resolveOuter({
        ok: false,
        output: stdout,
        durationMs: Date.now() - startedAt,
        exitCode: null,
        error: err.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolveOuter({
        ok: code === 0,
        output: stdout.trim(),
        durationMs: Date.now() - startedAt,
        exitCode: code,
        error: code === 0 ? undefined : stderr.slice(0, 500),
      });
    });
  });
}

function killProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Best-effort timeout cleanup.
    }
  }
}
