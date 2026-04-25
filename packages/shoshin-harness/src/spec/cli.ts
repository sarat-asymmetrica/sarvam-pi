// CLI handler for `shoshin spec`. Runs interview (or imports), validates, writes.
import { readFileSync } from "node:fs";
import kleur from "kleur";
import { ProjectSpecSchema } from "./types.js";
import { runInteractiveInterview } from "./interview.js";
import { readSpec, writeSpec } from "./store.js";
import { ensureShoshinDir, shoshinFile } from "../util/paths.js";
import { logTrail } from "../trail/writer.js";

interface SpecCliOptions {
  nonInteractive?: string;
}

export async function runSpec(opts: SpecCliOptions): Promise<void> {
  ensureShoshinDir();

  const existing = (() => {
    try {
      return readSpec();
    } catch {
      return null;
    }
  })();

  if (existing) {
    console.log(kleur.yellow(`[shoshin] .shoshin/spec.json already exists for "${existing.name}".`));
    console.log(
      kleur.gray("        Edit the file directly or delete it to re-run the interview.\n"),
    );
    return;
  }

  let spec;
  if (opts.nonInteractive) {
    const raw = JSON.parse(readFileSync(opts.nonInteractive, "utf8"));
    const parsed = ProjectSpecSchema.parse(raw);
    parsed.source = "imported";
    spec = parsed;
  } else {
    spec = await runInteractiveInterview();
  }

  writeSpec(spec);
  console.log(kleur.green(`✓ Wrote ${shoshinFile("spec")}`));
  console.log(kleur.gray(`  name: ${spec.name}`));
  console.log(kleur.gray(`  goal: ${spec.oneLineGoal}`));
  console.log(kleur.gray(`  stack: ${spec.primaryStack.lang}`));

  logTrail({
    kind: "spec_written",
    source: spec.source,
    name: spec.name,
  });
}
