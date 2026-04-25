// Orchestrator dispatch. Spawns a child Pi process running Sarvam with the
// envelope-restricted tool set and the persona-pair-activated system prompt.
//
// This is the chokepoint where Shoshin product layer meets the engine layer.
// All role subagent invocations go through here.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ProjectSpec } from "../spec/types.js";
import { RoleName } from "../roles/types.js";
import { buildSystemPrompt } from "../roles/prompt-builder.js";
import { envelopeForRole } from "../capabilities/role-envelopes.js";
import { envelopeSummary, toPiPlan } from "../capabilities/to-pi-tools.js";
import { hydrateMemory } from "../memory/hydrate.js";
import { currentPulse, pulseLine } from "../time/pulse.js";
import { readTrailTail } from "../trail/reader.js";
import { Trail, logTrail } from "../trail/writer.js";

export interface DispatchOptions {
  role: RoleName;
  ticketBrief: string;
  scopePath?: string; // required for builder; optional otherwise
  spec: ProjectSpec | null;
  cwd: string;
  timeoutMs?: number;
  extraSystemPromptHints?: string[];
}

export interface DispatchResult {
  ok: boolean;
  output: string;
  durationMs: number;
  exitCode: number | null;
  error?: string;
}

const SARVAM_PI_ROOT = resolve(
  process.env.SARVAM_PI_ROOT ?? "C:/Projects/sarvam-pi",
);

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

export async function dispatchSubagent(opts: DispatchOptions): Promise<DispatchResult> {
  const env = envelopeForRole(opts.role, {
    scopePath: opts.scopePath,
    cwd: opts.cwd,
  });
  const plan = toPiPlan(env);

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
  });

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...plan.envOverrides,
  };

  const cliPath = locatePiCli();
  const providerPath = locateSarvamProvider();

  // The child Pi process gets:
  //   --provider sarvam --model sarvam-105b
  //   --tools <comma-separated tools allowed by envelope>
  //   --no-session --print
  //   <prompt> as a single argument; we put the system prompt + ticket brief inline
  //
  // sarvam-pi's existing subagent extension uses this exact shape; we mirror it.
  const finalPrompt = [
    systemPrompt,
    "",
    "=== Child-agent protocol ===",
    "- Complete this in print mode.",
    "- Do not wait for user input.",
    "- Do not start an interactive conversation.",
    "- Once you have enough context, stop using tools and provide the final answer.",
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
    "--no-session",
    "--print",
  ];
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
      child.kill();
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
    child.on("close", (code) => {
      clearTimeout(timeout);
      const elapsed = Date.now() - startedAt;
      const ok = code === 0;
      const trimmed = stdout.trim();
      const digest = trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
      if (ok) {
        Trail.complete(opts.role, elapsed, digest);
      } else {
        Trail.failed(opts.role, `exit ${code}: ${stderr.slice(0, 200)}`);
      }
      resolveOuter({
        ok,
        output: trimmed,
        durationMs: elapsed,
        exitCode: code,
        error: ok ? undefined : `exit ${code}: ${stderr.slice(0, 500)}`,
      });
    });
  });
}
