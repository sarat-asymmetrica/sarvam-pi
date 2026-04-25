// `shoshin init` — bootstrap a project with .shoshin/ skeleton.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import kleur from "kleur";
import { ensureShoshinDir, projectRoot, shoshinDir } from "../util/paths.js";
import { writeJson } from "../util/json-io.js";
import { logTrail } from "../trail/writer.js";

export async function runInit(name?: string): Promise<void> {
  const cwd = projectRoot();
  const dir = shoshinDir(cwd);

  if (existsSync(dir)) {
    console.log(kleur.yellow(`[shoshin] .shoshin/ already exists at ${dir}.`));
    console.log(kleur.gray("        Re-running init is safe but won't overwrite files."));
  }

  ensureShoshinDir(cwd);

  // features.json — empty seed
  const featuresPath = join(dir, "features.json");
  if (!existsSync(featuresPath)) {
    writeJson(featuresPath, { version: 1, features: [] });
  }

  // config.json — minimal seed
  const configPath = join(dir, "config.json");
  if (!existsSync(configPath)) {
    writeJson(configPath, {
      version: 1,
      shoshinVersion: "0.1.0-foundation",
      projectName: name ?? null,
      maxParallelSubagents: 3,
      pulseEveryTurns: 3,
      defaultModel: "sarvam-105b",
    });
  }

  // .gitignore line for .shoshin/trail.jsonl rotation files (don't gitignore the dir itself —
  // spec.json and features.json should be committed; only large rotated files are ignored).
  const giPath = join(cwd, ".gitignore");
  const giAdd = "\n# Shoshin rotated trail logs\n.shoshin/trail-*.jsonl\n";
  if (existsSync(giPath)) {
    const current = "";
    try {
      const fs = await import("node:fs/promises");
      const data = await fs.readFile(giPath, "utf8");
      if (!data.includes(".shoshin/trail-")) {
        await fs.appendFile(giPath, giAdd);
      }
    } catch {
      // ignore
    }
  } else {
    writeFileSync(giPath, giAdd.trimStart(), "utf8");
  }

  // README in .shoshin/ describing what's in here.
  const readme = `# .shoshin/

This directory is managed by the Shoshin harness. Track everything here in git EXCEPT
\`trail-*.jsonl\` rotation files.

| File              | Purpose                                                       |
|-------------------|---------------------------------------------------------------|
| spec.json         | ProjectSpec — what this app is, written by \`shoshin spec\`. |
| features.json     | Feature Done Contract state — \`shoshin features\` manages.  |
| trail.jsonl       | Stigmergy event log (append-only).                            |
| roles.json        | Per-project role catalog overrides (optional).                |
| personas.json     | Per-project persona-pair overrides (optional).                |
| config.json       | Project-scoped Shoshin config.                                |

To inspect: \`shoshin status\`, \`shoshin trail tail\`.
`;
  const readmePath = join(dir, "README.md");
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, readme, "utf8");
  }

  console.log(kleur.green(`✓ Shoshin initialized at ${dir}`));
  console.log(kleur.gray("  Next: `shoshin spec` to run the discovery interview."));

  logTrail({
    kind: "memory_write",
    file: ".shoshin/",
    bytesAdded: 0,
  });
}
