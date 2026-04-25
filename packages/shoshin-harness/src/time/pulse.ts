// Time awareness as system property. Periodic injection of:
//   [session turns | elapsed | repo age | feature pace]
//
// For the AI: drift detection, time-boxing, calibration against past tasks.
// For the user: honest progress estimates, burnout awareness.
//
// See SHOSHIN_SWARM_MODEL.md "Time Awareness" section.
import { execSync } from "node:child_process";
import { readFeatures } from "../features/store.js";
import { Trail } from "../trail/writer.js";

export interface TimePulse {
  sessionTurns: number;
  elapsedMs: number;
  repoAgeDays: number | null;
  featurePace: string;
  sessionStartIso: string;
}

let sessionStart: number | null = null;
let sessionTurnCount = 0;

export function startSession(): void {
  sessionStart = Date.now();
  sessionTurnCount = 0;
}

export function bumpTurn(): number {
  if (sessionStart === null) startSession();
  return ++sessionTurnCount;
}

export function currentPulse(cwd: string = process.cwd()): TimePulse {
  if (sessionStart === null) startSession();
  const elapsedMs = Date.now() - (sessionStart as number);
  const repoAgeDays = repoAge(cwd);
  const pace = featurePace(cwd, elapsedMs);
  return {
    sessionTurns: sessionTurnCount,
    elapsedMs,
    repoAgeDays,
    featurePace: pace,
    sessionStartIso: new Date(sessionStart as number).toISOString(),
  };
}

export function pulseLine(p: TimePulse): string {
  const elapsedSec = Math.floor(p.elapsedMs / 1000);
  const elapsed =
    elapsedSec < 60
      ? `${elapsedSec}s`
      : elapsedSec < 3600
        ? `${Math.floor(elapsedSec / 60)}m${elapsedSec % 60}s`
        : `${Math.floor(elapsedSec / 3600)}h${Math.floor((elapsedSec % 3600) / 60)}m`;
  const age = p.repoAgeDays === null ? "?d" : `${p.repoAgeDays}d`;
  return `session: ${p.sessionTurns} turns | elapsed: ${elapsed} | repo age: ${age} | pace: ${p.featurePace}`;
}

// Days since most recent commit. Returns null if not a git repo.
function repoAge(cwd: string): number | null {
  try {
    const out = execSync("git log -1 --format=%ct", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    })
      .toString()
      .trim();
    if (!out) return null;
    const lastCommitMs = parseInt(out, 10) * 1000;
    if (Number.isNaN(lastCommitMs)) return null;
    return Math.max(0, Math.floor((Date.now() - lastCommitMs) / 86400_000));
  } catch {
    return null;
  }
}

// Features advanced per hour over the lifetime of this session.
function featurePace(cwd: string, elapsedMs: number): string {
  if (elapsedMs < 1000) return "0/hr";
  let advances = 0;
  try {
    const file = readFeatures(cwd);
    const sessionStartMs = Date.now() - elapsedMs;
    for (const f of file.features) {
      for (const h of f.history) {
        if (new Date(h.at).getTime() >= sessionStartMs) advances++;
      }
    }
  } catch {
    return "0/hr";
  }
  const perHour = (advances / (elapsedMs / 3600_000)).toFixed(1);
  return `${perHour}/hr`;
}

// Hook: emit a pulse to the trail every N turns. Caller handles cadence.
export function logPulseIfDue(turnsBetween = 3, cwd: string = process.cwd()): TimePulse | null {
  if (sessionTurnCount === 0 || sessionTurnCount % turnsBetween !== 0) return null;
  const p = currentPulse(cwd);
  Trail.pulse(p.sessionTurns, p.elapsedMs, p.repoAgeDays, p.featurePace);
  return p;
}
