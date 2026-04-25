// Read/write .shoshin/spec.json. Validates against zod on read.
import { ProjectSpec, ProjectSpecSchema } from "./types.js";
import { readJsonOr, writeJson } from "../util/json-io.js";
import { shoshinFile } from "../util/paths.js";

export function readSpec(cwd?: string): ProjectSpec | null {
  const raw = readJsonOr<unknown>(shoshinFile("spec", cwd), null as unknown);
  if (raw === null) return null;
  const parsed = ProjectSpecSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid .shoshin/spec.json: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function writeSpec(spec: ProjectSpec, cwd?: string): void {
  const validated = ProjectSpecSchema.parse(spec);
  if (!validated.createdAt) {
    validated.createdAt = new Date().toISOString();
  }
  writeJson(shoshinFile("spec", cwd), validated);
}

export function specExists(cwd?: string): boolean {
  return readSpec(cwd) !== null;
}
