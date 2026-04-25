// Browser-use adapter for Shoshin browser checks.
// Foundation-phase choice: expose browser-use as an optional first-class runner
// with graceful skip semantics, before making it a mandatory project dependency.
import { spawnSync } from "node:child_process";
import { Trail } from "../trail/writer.js";

export interface BrowserUseCheckOptions {
  task: string;
  cwd: string;
  feature?: string;
  timeoutMs?: number;
  requireInstalled?: boolean;
}

export interface BrowserUseCheckResult {
  ok: boolean;
  status: "passed" | "failed" | "skipped";
  engine: "browser-use";
  durationMs: number;
  output: string;
  error?: string;
}

export function runBrowserUseCheck(opts: BrowserUseCheckOptions): BrowserUseCheckResult {
  const started = Date.now();
  const python = process.env.SHOSHIN_PYTHON ?? "python";
  const probe = spawnSync(
    python,
    ["-c", "import browser_use; print(getattr(browser_use, '__version__', 'installed'))"],
    { cwd: opts.cwd, encoding: "utf8", timeout: 15_000 },
  );

  if (probe.status !== 0) {
    const result: BrowserUseCheckResult = {
      ok: !opts.requireInstalled,
      status: opts.requireInstalled ? "failed" : "skipped",
      engine: "browser-use",
      durationMs: Date.now() - started,
      output: "",
      error:
        "browser-use is not installed for this Python. Install with `uv add browser-use` or `pip install browser-use`.",
    };
    writeTrail(opts, result);
    return result;
  }

  const script = [
    "import asyncio, os",
    "from browser_use import Agent, Browser, ChatBrowserUse",
    "async def main():",
    "    browser = Browser()",
    "    agent = Agent(task=os.environ['SHOSHIN_BROWSER_TASK'], llm=ChatBrowserUse(), browser=browser)",
    "    result = await agent.run()",
    "    print(result)",
    "asyncio.run(main())",
  ].join("\n");

  const run = spawnSync(python, ["-c", script], {
    cwd: opts.cwd,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 180_000,
    env: {
      ...process.env,
      SHOSHIN_BROWSER_TASK: opts.task,
    },
  });
  const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.trim();
  const ok = run.status === 0 && !run.error;
  const result: BrowserUseCheckResult = {
    ok,
    status: ok ? "passed" : "failed",
    engine: "browser-use",
    durationMs: Date.now() - started,
    output,
    error: ok ? undefined : run.error?.message ?? `browser-use exited with code ${run.status}`,
  };
  writeTrail(opts, result);
  return result;
}

function writeTrail(opts: BrowserUseCheckOptions, result: BrowserUseCheckResult): void {
  Trail.browserCheck(
    opts.feature,
    result.status,
    result.engine,
    opts.task,
    result.durationMs,
    result.error ?? null,
    result.output.slice(0, 500),
  );
}
