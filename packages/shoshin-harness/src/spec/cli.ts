// CLI handler for `shoshin spec`. Three paths:
//   1. --non-interactive <file>  → import JSON spec (smokes, scripted setup)
//   2. --canned                  → fall back to canned 12-question English interview
//   3. default (key set)         → host-led conversational discovery (B8 default)
//   4. default (no key)          → falls back to canned interview with a notice
import { readFileSync } from "node:fs";
import kleur from "kleur";
import { ProjectSpec, ProjectSpecSchema } from "./types.js";
import { runInteractiveInterview } from "./interview.js";
import { runSarvamInterview } from "./sarvam_interview.js";
import { readSpec, writeSpec } from "./store.js";
import { ensureShoshinDir, shoshinFile } from "../util/paths.js";
import { logTrail } from "../trail/writer.js";

interface SpecCliOptions {
  nonInteractive?: string;
  canned?: boolean; // force canned interview even with key
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

  let spec: ProjectSpec | null = null;

  if (opts.nonInteractive) {
    const raw = JSON.parse(readFileSync(opts.nonInteractive, "utf8"));
    const parsed = ProjectSpecSchema.parse(raw);
    parsed.source = "imported";
    spec = parsed;
  } else if (!opts.canned && process.env.SARVAM_API_KEY) {
    // Default path: host-led conversational discovery
    const cwd = process.cwd();
    const result = await runSarvamInterview({ cwd });
    if (!result.spec) {
      console.error(
        kleur.red(`\n✗ Discovery did not complete (reason: ${result.reason}).`),
      );
      if (result.error) console.error(kleur.gray(`  ${result.error}`));
      console.error(
        kleur.gray(
          "  Run again, or use `shoshin spec --canned` for the offline 12-question form.",
        ),
      );
      process.exit(3);
    }
    spec = result.spec;
    spec.source = "interview";
  } else {
    if (!opts.canned && !process.env.SARVAM_API_KEY) {
      console.log(
        kleur.gray(
          "[shoshin] SARVAM_API_KEY not set — falling back to canned interview.\n",
        ),
      );
    }
    spec = await runInteractiveInterview();
  }

  if (!spec) {
    console.error(kleur.red("✗ no spec produced — aborting"));
    process.exit(3);
  }

  writeSpec(spec);
  console.log(kleur.green(`\n✓ Wrote ${shoshinFile("spec")}`));
  console.log(kleur.gray(`  name: ${spec.name}`));
  console.log(kleur.gray(`  goal: ${spec.oneLineGoal}`));
  console.log(kleur.gray(`  stack: ${spec.primaryStack.lang}`));

  logTrail({
    kind: "spec_written",
    source: spec.source,
    name: spec.name,
  });
}
