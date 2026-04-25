// CLI surface for Shoshin browser checks.
// Foundation-phase choice: expose browser-use manually first, then let QA roles
// consume the same runner once deterministic browser gates are in place.
import kleur from "kleur";
import { runBrowserUseCheck } from "./browser-use.js";

interface BrowserCliOptions {
  feature?: string;
  timeoutSec?: string;
  requireInstalled?: boolean;
}

export async function runBrowserCheck(taskParts: string[] | undefined, opts: BrowserCliOptions): Promise<void> {
  const task = (taskParts ?? []).join(" ").trim();
  if (!task) {
    console.error(kleur.red("usage: shoshin browser-check <task...>"));
    process.exit(2);
  }
  const timeoutMs = Math.max(10, parseInt(opts.timeoutSec ?? "180", 10) || 180) * 1000;
  const result = runBrowserUseCheck({
    task,
    cwd: process.cwd(),
    feature: opts.feature,
    timeoutMs,
    requireInstalled: opts.requireInstalled,
  });
  const color = result.status === "passed" ? kleur.green : result.status === "skipped" ? kleur.yellow : kleur.red;
  console.log(color(`browser-use ${result.status} in ${result.durationMs}ms`));
  if (result.error) console.log(kleur.gray(result.error));
  if (result.output) console.log(result.output);
  process.exit(result.ok ? 0 : 1);
}
