// Mutation gate for Builder completion claims.
// Foundation-phase choice: compare scoped file fingerprints before/after dispatch
// so a prose-only or read-only "success" cannot advance a feature to MODEL_DONE.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface MutationSnapshot {
  root: string;
  files: Record<string, string>;
}

export interface MutationGateResult {
  ok: boolean;
  root: string;
  changedFiles: string[];
  reason?: string;
}

export function snapshotScope(cwd: string, scopePath?: string): MutationSnapshot {
  const root = resolve(cwd, scopePath ?? ".");
  return {
    root,
    files: existsSync(root) ? listFingerprints(root) : {},
  };
}

export function compareMutationSnapshot(before: MutationSnapshot): MutationGateResult {
  const after = existsSync(before.root) ? listFingerprints(before.root) : {};
  const changed = new Set<string>();

  for (const [file, fingerprint] of Object.entries(after)) {
    if (before.files[file] !== fingerprint) changed.add(file);
  }
  for (const file of Object.keys(before.files)) {
    if (!(file in after)) changed.add(file);
  }

  const changedFiles = [...changed].sort();
  return changedFiles.length > 0
    ? { ok: true, root: before.root, changedFiles }
    : {
        ok: false,
        root: before.root,
        changedFiles,
        reason: "Builder reported success without changing files in scope",
      };
}

function listFingerprints(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (path: string): void => {
    const st = statSync(path);
    if (st.isFile()) {
      const key = relative(root, path).replace(/\\/g, "/");
      out[key] = `${st.size}:${Math.floor(st.mtimeMs)}`;
      return;
    }
    if (!st.isDirectory()) return;
    for (const entry of readdirSync(path)) {
      if (entry === ".git" || entry === "node_modules" || entry === ".shoshin") continue;
      visit(join(path, entry));
    }
  };
  visit(root);
  return out;
}
