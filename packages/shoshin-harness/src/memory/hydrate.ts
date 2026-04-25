// Top-level memory hydration: load → filter → encode. Returns the bundle string
// to inject into the system prompt. Caller decides whether to use TOON or plain.
import { ProjectSpec } from "../spec/types.js";
import { loadMemorySources, relevanceFilter, MemorySource } from "./load.js";
import { encodeMemoryBundle, encodePlain } from "./toon.js";
import { logTrail } from "../trail/writer.js";

export interface HydrateOptions {
  cwd?: string;
  spec?: ProjectSpec | null;
  encoding?: "toon" | "plain";
  minHits?: number;
}

export interface HydrateResult {
  bundle: string;
  sources: MemorySource[];
  bytesIn: number;
  bytesOut: number;
  encoding: "toon" | "plain";
}

export function hydrateMemory(opts: HydrateOptions = {}): HydrateResult {
  const cwd = opts.cwd ?? process.cwd();
  const encoding = opts.encoding ?? "toon";

  const all = loadMemorySources(cwd);
  const filtered = opts.spec ? relevanceFilter(all, opts.spec, opts.minHits ?? 1) : all;

  if (encoding === "toon") {
    try {
      const enc = encodeMemoryBundle(filtered);
      logTrail({
        kind: "memory_write",
        file: ".shoshin/[hydrate]",
        bytesAdded: enc.bytesOut,
      });
      return {
        bundle: enc.bundle,
        sources: filtered,
        bytesIn: enc.bytesIn,
        bytesOut: enc.bytesOut,
        encoding: "toon",
      };
    } catch {
      // TOON fail-safe: fall back to plain.
    }
  }

  const plain = encodePlain(filtered);
  return {
    bundle: plain,
    sources: filtered,
    bytesIn: filtered.reduce((s, x) => s + x.bytes, 0),
    bytesOut: Buffer.byteLength(plain, "utf8"),
    encoding: "plain",
  };
}
