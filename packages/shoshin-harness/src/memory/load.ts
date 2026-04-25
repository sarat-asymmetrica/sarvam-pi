// Memory hydration. Loads MEMORY.md / AGENTS.md / INVARIANTS.md from project root
// and ~/.shoshin/, size-bounds the result, and produces a relevance-filtered bundle
// for prompt injection.
//
// Foundation phase: simple keyword-match relevance against ProjectSpec. Vector
// retrieval is post-foundation — the memory layer described by `asymm-mem` from the
// April 16 launch (12,800 LOC, MCP-wired) is the upgrade path. For now, this is
// good enough to verify the loop.
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ProjectSpec } from "../spec/types.js";

export interface MemorySource {
  path: string;
  content: string;
  bytes: number;
  origin: "project" | "user";
}

const DEFAULT_FILES = ["MEMORY.md", "AGENTS.md", "INVARIANTS.md", "CLAUDE.md"];
const MAX_BYTES_PER_FILE = 64 * 1024; // skip files larger than 64KB; flag for compaction

export function loadMemorySources(cwd: string = process.cwd()): MemorySource[] {
  const sources: MemorySource[] = [];

  for (const file of DEFAULT_FILES) {
    const projPath = join(cwd, file);
    if (existsSync(projPath)) {
      const stat = statSync(projPath);
      if (stat.size > MAX_BYTES_PER_FILE) {
        sources.push({
          path: projPath,
          content: `[skipped: ${stat.size}B exceeds ${MAX_BYTES_PER_FILE}B; queue for librarian compaction]`,
          bytes: stat.size,
          origin: "project",
        });
        continue;
      }
      sources.push({
        path: projPath,
        content: readFileSync(projPath, "utf8"),
        bytes: stat.size,
        origin: "project",
      });
    }
  }

  // ~/.shoshin/MEMORY.md — user-lifetime memory across projects
  const userMem = join(homedir(), ".shoshin", "MEMORY.md");
  if (existsSync(userMem)) {
    const stat = statSync(userMem);
    if (stat.size <= MAX_BYTES_PER_FILE) {
      sources.push({
        path: userMem,
        content: readFileSync(userMem, "utf8"),
        bytes: stat.size,
        origin: "user",
      });
    }
  }

  return sources;
}

// Foundation-phase relevance: keyword overlap between source content and the
// project spec. Sources with >=N keyword hits are kept; others are dropped from
// the bundle (they remain in the file system; this is just prompt-budget filter).
export function relevanceFilter(
  sources: MemorySource[],
  spec: ProjectSpec | null,
  minHits = 1,
): MemorySource[] {
  if (!spec) return sources;
  const keywords = new Set<string>();
  const add = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((part) => part.length > 3)
      .forEach((part) => keywords.add(part));
  add(spec.name);
  add(spec.oneLineGoal);
  add(spec.primaryUser);
  add(spec.primaryStack.lang);
  if (spec.primaryStack.framework) add(spec.primaryStack.framework);
  for (const m of spec.mathPrimitives) add(m);
  for (const s of spec.surfaces) add(s);

  return sources.filter((src) => {
    const lowered = src.content.toLowerCase();
    let hits = 0;
    for (const kw of keywords) {
      if (lowered.includes(kw)) {
        hits++;
        if (hits >= minHits) return true;
      }
    }
    return hits >= minHits;
  });
}
