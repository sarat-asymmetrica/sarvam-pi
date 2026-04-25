// Read/write .shoshin/features.json. Atomic writes, zod-validated reads.
import { Feature, FeaturesFile, FeaturesFileSchema } from "./types.js";
import { readJsonOr, writeJson } from "../util/json-io.js";
import { shoshinFile } from "../util/paths.js";

const EMPTY: FeaturesFile = { version: 1, features: [] };

export function readFeatures(cwd?: string): FeaturesFile {
  const raw = readJsonOr<unknown>(shoshinFile("features", cwd), EMPTY);
  const parsed = FeaturesFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid .shoshin/features.json: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function writeFeatures(file: FeaturesFile, cwd?: string): void {
  const validated = FeaturesFileSchema.parse(file);
  writeJson(shoshinFile("features", cwd), validated);
}

export function getFeature(id: string, cwd?: string): Feature | undefined {
  return readFeatures(cwd).features.find((f) => f.id === id);
}

export function upsertFeature(feature: Feature, cwd?: string): void {
  const file = readFeatures(cwd);
  const idx = file.features.findIndex((f) => f.id === feature.id);
  if (idx === -1) {
    file.features.push(feature);
  } else {
    file.features[idx] = feature;
  }
  writeFeatures(file, cwd);
}
