// Feature Done Contract types. The state machine + evidence-of-advance is enforced
// by transitions.ts; the shape lives here so other modules can refer without circular
// imports.
//
// See docs/FEATURE_DONE_CONTRACT.md for the full contract.
import { z } from "zod";

export const FEATURE_STATES = [
  "REQUESTED",
  "SCAFFOLDED",
  "MODEL_DONE",
  "VM_DONE",
  "VIEW_DONE",
  "WIRED",
  "VERIFIED",
  "DONE",
] as const;
export type FeatureState = (typeof FEATURE_STATES)[number];

export const FeatureSchema = z.object({
  id: z.string().min(1), // slugged from name
  name: z.string().min(1),
  description: z.string().default(""),
  state: z.enum(FEATURE_STATES).default("REQUESTED"),
  scopePath: z.string().optional(), // e.g. "internal/invoice/" — bounds Builder writes
  createdAt: z.string(),
  updatedAt: z.string(),
  // Light-weight history; full event log lives in trail.jsonl.
  history: z
    .array(
      z.object({
        from: z.enum(FEATURE_STATES),
        to: z.enum(FEATURE_STATES),
        at: z.string(),
        evidence: z.string().optional(),
      }),
    )
    .default([]),
});
export type Feature = z.infer<typeof FeatureSchema>;

export const FeaturesFileSchema = z.object({
  version: z.literal(1).default(1),
  features: z.array(FeatureSchema).default([]),
});
export type FeaturesFile = z.infer<typeof FeaturesFileSchema>;

export function nextStateOf(state: FeatureState): FeatureState | null {
  const idx = FEATURE_STATES.indexOf(state);
  if (idx === -1 || idx === FEATURE_STATES.length - 1) return null;
  return FEATURE_STATES[idx + 1];
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
