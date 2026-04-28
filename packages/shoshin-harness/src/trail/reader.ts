// Stigmergy trail reader. The next subagent reads the tail of the trail before
// taking action — this is the substrate that replaces a message bus. Filters by
// kind, feature, role, or session.
import { TrailKind, TrailRecord } from "./types.js";
import { readJsonlOr, readJsonlTail } from "../util/json-io.js";
import { shoshinFile } from "../util/paths.js";

export function readTrailTail(n = 50, cwd?: string): TrailRecord[] {
  return readJsonlTail<TrailRecord>(shoshinFile("trail", cwd), n);
}

export function readTrail(cwd?: string): TrailRecord[] {
  return readJsonlOr<TrailRecord>(shoshinFile("trail", cwd), []);
}

export interface TrailFilter {
  kind?: TrailKind | TrailKind[];
  feature?: string;
  role?: string;
  session?: string;
  since?: string; // ISO timestamp lower bound
}

export function filterTrail(records: TrailRecord[], filter: TrailFilter): TrailRecord[] {
  return records.filter((r) => {
    if (filter.kind) {
      const kinds = Array.isArray(filter.kind) ? filter.kind : [filter.kind];
      if (!kinds.includes(r.kind)) return false;
    }
    if (filter.feature && r.feature !== filter.feature) return false;
    if (filter.role && r.role !== filter.role) return false;
    if (filter.session && r.session !== filter.session) return false;
    if (filter.since && r.ts < filter.since) return false;
    return true;
  });
}
