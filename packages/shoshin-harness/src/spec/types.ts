// ProjectSpec — declarative description of what we're building. Hydrated by the
// discovery interview and consumed by every role subagent. Single source of truth
// for "what this app is".
//
// Cap'n Proto schema lives in schemas/projectspec.capnp; this zod schema is the
// runtime truth until codegen is wired.
import { z } from "zod";

export const SCAFFOLD_MODES = ["full_mvvm", "lite", "custom"] as const;
export type ScaffoldMode = (typeof SCAFFOLD_MODES)[number];

export const APP_SHAPES = ["cli", "desktop", "web", "api", "mobile"] as const;
export type AppShape = (typeof APP_SHAPES)[number];

export const SURFACES = ["telegram", "miniapp", "pwa", "desktop", "cli", "voice"] as const;
export type Surface = (typeof SURFACES)[number];

export const STORAGES = ["sqlite", "postgres", "spacetimedb", "filesystem", "memory"] as const;
export type Storage = (typeof STORAGES)[number];

// "Done invariants" trace back to Day-200 Finished Software Invariants
// (Correct ∧ Complete ∧ Accessible ∧ Secure ∧ Observable ∧ Maintainable ∧ Tested).
export const DONE_INVARIANTS = [
  "correct",
  "complete",
  "accessible",
  "secure",
  "observable",
  "maintainable",
  "tested",
] as const;
export type DoneInvariant = (typeof DONE_INVARIANTS)[number];

// Math primitives that can be embedded into the generated app's internal/math/.
// See SHOSHIN_MATHEMATICAL_SUBSTRATE.md for the catalog.
export const MATH_PRIMITIVES = [
  "digital_root",
  "williams_batching",
  "slerp_state",
  "phi_ratio",
  "vedic_mul",
  "katapayadi_encode",
  "regime_classifier",
  "lagrangian_minimize",
  "attractor_check",
  "boundary_alerts",
] as const;
export type MathPrimitive = (typeof MATH_PRIMITIVES)[number];

export const ProjectSpecSchema = z.object({
  name: z.string().min(1),
  oneLineGoal: z.string().min(1),
  primaryUser: z.string().min(1),
  targetLanguages: z.array(z.string()).min(1),
  scaffoldMode: z.enum(SCAFFOLD_MODES).default("lite"),
  appShape: z.enum(APP_SHAPES).default("cli"),
  primaryStack: z.object({
    lang: z.string().min(1),
    framework: z.string().optional(),
  }),
  storage: z.enum(STORAGES).optional(),
  surfaces: z.array(z.enum(SURFACES)).default(["cli"]),
  mathPrimitives: z.array(z.enum(MATH_PRIMITIVES)).default([]),
  doneInvariants: z.array(z.enum(DONE_INVARIANTS)).default([
    "correct",
    "tested",
    "observable",
  ]),
  notes: z.string().optional(),

  // Provenance: when + how this spec was created. Useful for trail context.
  createdAt: z.string().optional(),
  source: z.enum(["interview", "manual", "imported"]).default("interview"),
});

export type ProjectSpec = z.infer<typeof ProjectSpecSchema>;

// Briefly summarize a spec for prompt-injection. Keep under ~200 tokens to fit budget.
export function summarizeSpec(spec: ProjectSpec): string {
  return [
    `Name: ${spec.name}`,
    `Goal: ${spec.oneLineGoal}`,
    `User: ${spec.primaryUser}`,
    `Stack: ${spec.primaryStack.lang}${spec.primaryStack.framework ? "/" + spec.primaryStack.framework : ""}`,
    `Shape: ${spec.appShape}`,
    `Surfaces: ${spec.surfaces.join(", ")}`,
    spec.storage ? `Storage: ${spec.storage}` : "",
    `Languages: ${spec.targetLanguages.join(", ")}`,
    `Scaffold: ${spec.scaffoldMode}`,
    spec.mathPrimitives.length ? `Math: ${spec.mathPrimitives.join(", ")}` : "",
    `Done invariants: ${spec.doneInvariants.join(", ")}`,
    spec.notes ? `Notes: ${spec.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
