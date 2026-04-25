// Role catalog types. The 7-role swarm: Architect, PM, Scout, Builder, Reviewer, QA,
// Librarian. Each role has a concern, persona pair, default capability envelope, and
// system-prompt template.
//
// See SHOSHIN_SWARM_MODEL.md for the full catalog and CAPABILITY_ENVELOPE.md for
// the per-role envelope tables.
import { z } from "zod";

export const ROLE_NAMES = [
  "host",
  "architect",
  "pm",
  "scout",
  "builder",
  "reviewer",
  "qa",
  "librarian",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const PERSONA_NAMES = [
  // Host pair — patient warmth + person-centered listening
  "tagore",
  "carl_rogers",
  // Architect pair
  "mirzakhani",
  "torvalds",
  // PM pair
  "grace_hopper",
  "maya_angelou",
  // Scout pair
  "darwin",
  "ada_lovelace",
  // Builder pair
  "ramanujan",
  "margaret_hamilton",
  // Reviewer pair
  "fermi",
  "feynman",
  // QA pair
  "marie_curie",
  "murphy",
  // Librarian pair
  "borges",
  "knuth",
] as const;
export type PersonaName = (typeof PERSONA_NAMES)[number];

export interface RoleDef {
  name: RoleName;
  concern: string;
  personaPair: [PersonaName, PersonaName];
  defaultEnvelope: string[]; // capability identifiers; see capabilities/role-envelopes.ts
  promptTemplate: string; // base system-prompt fragment, persona pair injected in front
}

export interface PersonaDef {
  name: PersonaName;
  shortLabel: string; // single-line "who this persona is"
  activation: string; // 1-2 sentence prompt fragment to activate this register
}

export const RoleCatalogSchema = z.object({
  version: z.literal(1).default(1),
  roles: z.array(z.unknown()).default([]), // overrides validated at load
});
