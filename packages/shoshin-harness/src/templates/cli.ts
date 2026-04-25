// CLI handler for `shoshin scaffold-math` — selects primitives from spec
// and copies them into <app>/internal/math/<primitive>/.
import kleur from "kleur";
import { readSpec } from "../spec/store.js";
import { applyPrimitivesFromSpec, selectPrimitives } from "./mathprimitives.js";
import { logTrail } from "../trail/writer.js";

interface ScaffoldMathOptions {
  dryRun?: boolean;
}

export async function runScaffoldMath(opts: ScaffoldMathOptions): Promise<void> {
  const spec = readSpec();
  if (!spec) {
    console.error(kleur.red("✗ No .shoshin/spec.json — run `shoshin spec` first."));
    process.exit(2);
  }

  const cwd = process.cwd();
  const selections = selectPrimitives(spec);

  if (selections.length === 0) {
    console.log(kleur.yellow("No primitives selected for this ProjectSpec."));
    console.log(
      kleur.gray("  Add to spec.mathPrimitives or change appShape/surfaces to trigger selection."),
    );
    return;
  }

  console.log(kleur.bold(`\n📐 Math primitive selection for ${kleur.cyan(spec.name)}\n`));
  for (const s of selections) {
    console.log(`  ${kleur.green("•")} ${kleur.bold(s.primitive)}`);
    for (const reason of s.reasons) {
      console.log(`      ${kleur.gray(reason)}`);
    }
  }

  if (opts.dryRun) {
    console.log(kleur.yellow("\n  (--dry-run) no files written"));
    return;
  }

  const { copies } = applyPrimitivesFromSpec(spec, cwd);
  console.log(kleur.bold("\n✓ Scaffolded:\n"));
  for (const c of copies) {
    console.log(
      `  ${kleur.cyan(c.primitive)} → ${kleur.gray(c.destPath)}  ` +
        kleur.green(`(+${c.filesWritten})`) +
        (c.filesSkipped > 0 ? kleur.gray(` (~${c.filesSkipped} existed)`) : ""),
    );
  }

  for (const c of copies) {
    logTrail({
      kind: "memory_write",
      file: c.destPath,
      bytesAdded: c.filesWritten,
    });
  }

  console.log(
    kleur.gray("\n  Run `go test ./internal/math/...` to verify the new packages.\n"),
  );
}
