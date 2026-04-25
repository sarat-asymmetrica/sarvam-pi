// Pi session key persistence for Shoshin dispatches.
// Foundation choice: keep the mapping as tiny text files under .shoshin/sessions
// so the harness can resume Pi's native JSONL history without owning it.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { shoshinDir } from "../util/paths.js";

const SAFE_KEY = /[^a-zA-Z0-9._-]+/g;

export function sessionKeyToPath(cwd: string, key: string): string {
  const safe = key.trim().replace(SAFE_KEY, "_").replace(/^_+|_+$/g, "") || "default";
  return join(shoshinDir(cwd), "sessions", `${safe}.id`);
}

export function readStoredSessionId(cwd: string, key?: string): string | undefined {
  if (!key) return undefined;
  const path = sessionKeyToPath(cwd, key);
  if (!existsSync(path)) return undefined;
  const id = readFileSync(path, "utf8").trim();
  return id.length > 0 ? id : undefined;
}

export function writeStoredSessionId(cwd: string, key: string, sessionId: string): string {
  const path = sessionKeyToPath(cwd, key);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${sessionId}\n`, "utf8");
  renameSync(tmp, path);
  return path;
}
