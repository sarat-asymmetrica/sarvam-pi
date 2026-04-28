// Atomic JSON read/write. Writes go via .tmp then rename so a crash mid-write
// can never leave a half-file on disk. JSONL append uses O_APPEND for safety.
import { appendFileSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export function readJson<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

export function readJsonOr<T>(path: string, fallback: T): T {
  try {
    return readJson<T>(path);
  } catch (err: any) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, path);
}

export function appendJsonl(path: string, record: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
}

export function readJsonlTail<T>(path: string, n: number): T[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);
  return lines.slice(-n).map((line) => JSON.parse(line) as T);
}

export function readJsonlOr<T>(path: string, fallback: T[]): T[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
  return raw.split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as T);
}
