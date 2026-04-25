// Project-root + .shoshin/ path helpers. Single source of truth for filesystem layout.
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function projectRoot(cwd: string = process.cwd()): string {
  return resolve(cwd);
}

export function shoshinDir(cwd?: string): string {
  return join(projectRoot(cwd), ".shoshin");
}

export function ensureShoshinDir(cwd?: string): string {
  const dir = shoshinDir(cwd);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export const ShoshinFiles = {
  spec: "spec.json",
  features: "features.json",
  trail: "trail.jsonl",
  roles: "roles.json",
  personas: "personas.json",
  config: "config.json",
} as const;

export function shoshinFile(name: keyof typeof ShoshinFiles, cwd?: string): string {
  return join(shoshinDir(cwd), ShoshinFiles[name]);
}
