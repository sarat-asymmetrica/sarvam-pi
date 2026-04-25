// TOON-encode a memory bundle for prompt injection. TOON saves ~30% tokens vs
// JSON at the LLM boundary (proven in Ananta production, April 13 2026 — the
// reason French/Telugu extraction unlocked).
//
// The library exposes both an object encoder (JSON-like) and a markdown-aware
// encoder. For memory bundles we prefer markdown-aware: source files are
// markdown today, and we want headings preserved.
import { encode as toonEncode } from "@toon-format/toon";
import type { MemorySource } from "./load.js";

export interface ToonMemoryBundle {
  bundle: string;
  bytesIn: number;
  bytesOut: number;
}

// Compact a bundle of sources into a single TOON-encoded string. We don't pass
// the raw markdown through @toon-format/toon (it's a JSON encoder); instead we
// shape a JSON-like object whose tokens encode well, then call encode().
export function encodeMemoryBundle(sources: MemorySource[]): ToonMemoryBundle {
  const bytesIn = sources.reduce((s, x) => s + x.bytes, 0);
  if (sources.length === 0) {
    return { bundle: "", bytesIn: 0, bytesOut: 0 };
  }

  const obj: Record<string, unknown> = {
    memories: sources.map((s) => ({
      origin: s.origin,
      path: s.path,
      content: trimToBudget(s.content, 4096), // per-source token budget
    })),
  };

  // toon encode falls back to JSON-ish text but with reduced quoting + indentation.
  const bundle = toonEncode(obj as any);
  return { bundle, bytesIn, bytesOut: Buffer.byteLength(bundle, "utf8") };
}

// Plain-prose fallback for environments where TOON encoding fails. Keeps the
// flow alive — never block prompt assembly on a serialization error.
export function encodePlain(sources: MemorySource[]): string {
  if (sources.length === 0) return "";
  return sources
    .map((s) => {
      const head = `--- ${s.origin}: ${s.path} (${s.bytes}B) ---`;
      return `${head}\n${trimToBudget(s.content, 4096)}\n`;
    })
    .join("\n");
}

function trimToBudget(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  // Cut at line boundary nearest to maxBytes
  const slice = text.slice(0, maxBytes);
  const lastNl = slice.lastIndexOf("\n");
  return (lastNl > 0 ? slice.slice(0, lastNl) : slice) + "\n[... truncated ...]";
}
