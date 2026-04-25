// ProjectSpec → math primitive selection. Maps ProjectSpec fields to a
// recommended primitive set, plus utilities to copy primitive directories
// into a target app's internal/math/ tree.
//
// Foundation phase: selection rules are heuristic and explicit. Future:
// could become a learned policy over feature/spec history.
import { copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectSpec } from "../spec/types.js";

const __filename = fileURLToPath(import.meta.url);
const TEMPLATES_ROOT = resolve(dirname(__filename), "..", "..", "templates", "mathprimitives");

// Selection table: primitive name → reasons it should land. Returning the
// reasons enables the harness to surface "why these were picked" to users.
export interface PrimitiveSelection {
  primitive: string;
  reasons: string[];
}

export function selectPrimitives(spec: ProjectSpec): PrimitiveSelection[] {
  const out: PrimitiveSelection[] = [];

  // 1. digital_root — almost always useful (pre-LLM gate, hashing, regime classify)
  if (
    spec.mathPrimitives.includes("digital_root") ||
    spec.surfaces.some((s) => s === "telegram" || s === "miniapp" || s === "pwa") ||
    spec.appShape === "api"
  ) {
    out.push({
      primitive: "digital_root",
      reasons: [
        spec.mathPrimitives.includes("digital_root")
          ? "explicitly requested in ProjectSpec"
          : "useful for pre-LLM gating + payload hashing on " + spec.appShape + " surfaces",
      ],
    });
  }

  // 2. williams — any time parallelism matters (multi-agent, batch jobs, fan-out)
  if (
    spec.mathPrimitives.includes("williams_batching") ||
    spec.appShape === "api" ||
    spec.appShape === "web"
  ) {
    out.push({
      primitive: "williams",
      reasons: [
        spec.mathPrimitives.includes("williams_batching")
          ? "explicitly requested"
          : "default parallelism bound for " + spec.appShape + " apps",
      ],
    });
  }

  // 3. quaternion — state tracking apps (chat, conversation, agent loops)
  if (
    spec.mathPrimitives.includes("slerp_state") ||
    spec.surfaces.includes("telegram") ||
    spec.surfaces.includes("voice")
  ) {
    out.push({
      primitive: "quaternion",
      reasons: [
        spec.mathPrimitives.includes("slerp_state")
          ? "explicitly requested"
          : "stateful conversation surface needs S³ representation",
      ],
    });
  }

  // 4. regime — any system that needs health monitoring or three-mode dynamics
  if (
    spec.mathPrimitives.includes("regime_classifier") ||
    spec.doneInvariants.includes("observable")
  ) {
    out.push({
      primitive: "regime",
      reasons: [
        spec.mathPrimitives.includes("regime_classifier")
          ? "explicitly requested"
          : "observability invariant requires regime health monitoring",
      ],
    });
  }

  return out;
}

// Copy a single primitive directory from templates/ into the target app's
// internal/math/<primitive>/. Skips files that already exist (idempotent).
export interface CopyResult {
  primitive: string;
  destPath: string;
  filesWritten: number;
  filesSkipped: number;
}

export function copyPrimitive(
  primitive: string,
  appRoot: string,
): CopyResult {
  const src = join(TEMPLATES_ROOT, primitive);
  const dest = join(appRoot, "internal", "math", primitive);
  const result: CopyResult = {
    primitive,
    destPath: dest,
    filesWritten: 0,
    filesSkipped: 0,
  };

  if (!statSync(src, { throwIfNoEntry: false })) {
    throw new Error(`primitive template not found: ${src}`);
  }

  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dest, entry);
    if (statSync(s).isDirectory()) continue; // primitives are flat; nested directories are not used
    const exists = statSync(d, { throwIfNoEntry: false });
    if (exists) {
      result.filesSkipped++;
      continue;
    }
    copyFileSync(s, d);
    result.filesWritten++;
  }
  return result;
}

// Convenience: select + copy in one shot. Returns the per-primitive results.
export function applyPrimitivesFromSpec(
  spec: ProjectSpec,
  appRoot: string,
): { selections: PrimitiveSelection[]; copies: CopyResult[] } {
  const selections = selectPrimitives(spec);
  const copies = selections.map((s) => copyPrimitive(s.primitive, appRoot));
  return { selections, copies };
}
