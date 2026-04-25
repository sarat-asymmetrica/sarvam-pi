// CLI handler for `shoshin features <action> [name]`.
import kleur from "kleur";
import { Feature, FEATURE_STATES, FeatureState, slugify } from "./types.js";
import { getFeature, readFeatures, upsertFeature } from "./store.js";
import { advanceFeature } from "./transitions.js";

interface FeaturesCliOptions {
  state?: string;
  evidence?: string;
}

export async function runFeatures(
  action: string,
  name: string | undefined,
  opts: FeaturesCliOptions,
): Promise<void> {
  switch (action) {
    case "list":
      return listFeatures();
    case "add":
      return addFeature(name);
    case "status":
      return statusFeature(name);
    case "advance":
      return advanceCli(name, opts);
    default:
      console.error(kleur.red(`Unknown action: ${action}. Try: list | add | status | advance`));
      process.exit(2);
  }
}

function listFeatures(): void {
  const file = readFeatures();
  if (file.features.length === 0) {
    console.log(kleur.gray("(no features yet — try `shoshin features add <name>`)"));
    return;
  }
  for (const f of file.features) {
    const stateColor = colorForState(f.state);
    console.log(`${stateColor(f.state.padEnd(11))} ${kleur.bold(f.id)}  ${kleur.gray(f.name)}`);
  }
}

function addFeature(name: string | undefined): void {
  if (!name) {
    console.error(kleur.red("usage: shoshin features add <name>"));
    process.exit(2);
  }
  const id = slugify(name);
  const existing = getFeature(id);
  if (existing) {
    console.error(kleur.yellow(`Feature already exists: ${id} (${existing.state})`));
    return;
  }
  const now = new Date().toISOString();
  const feature: Feature = {
    id,
    name,
    description: "",
    state: "REQUESTED",
    createdAt: now,
    updatedAt: now,
    history: [],
  };
  upsertFeature(feature);
  console.log(kleur.green(`✓ Added feature ${id} (REQUESTED)`));
}

function statusFeature(name: string | undefined): void {
  if (!name) {
    listFeatures();
    return;
  }
  const f = getFeature(slugify(name));
  if (!f) {
    console.error(kleur.red(`Feature not found: ${name}`));
    process.exit(2);
  }
  console.log(kleur.bold(f.name));
  console.log(`  id:      ${f.id}`);
  console.log(`  state:   ${colorForState(f.state)(f.state)}`);
  console.log(`  scope:   ${f.scopePath ?? kleur.gray("(unset)")}`);
  console.log(`  created: ${f.createdAt}`);
  console.log(`  updated: ${f.updatedAt}`);
  if (f.history.length) {
    console.log(`  history:`);
    for (const h of f.history) {
      console.log(
        `    ${h.from} → ${h.to}  ${kleur.gray(h.at)}` +
          (h.evidence ? ` — ${kleur.gray(h.evidence)}` : ""),
      );
    }
  }
}

function advanceCli(name: string | undefined, opts: FeaturesCliOptions): void {
  if (!name) {
    console.error(kleur.red("usage: shoshin features advance <name> [--state X] [--evidence text]"));
    process.exit(2);
  }
  const f = getFeature(slugify(name));
  if (!f) {
    console.error(kleur.red(`Feature not found: ${name}`));
    process.exit(2);
  }
  const targetState = opts.state as FeatureState | undefined;
  if (targetState && !FEATURE_STATES.includes(targetState)) {
    console.error(kleur.red(`Unknown state: ${targetState}. Must be one of ${FEATURE_STATES.join(", ")}`));
    process.exit(2);
  }
  const result = advanceFeature(f, {
    to: targetState,
    evidence: opts.evidence,
  });
  if (!result.ok) {
    console.error(kleur.red(`✗ ${result.reason}`));
    process.exit(1);
  }
  console.log(
    kleur.green(`✓ ${f.id}: ${result.feature.history[result.feature.history.length - 1]!.from} → ${result.feature.state}`),
  );
}

function colorForState(state: FeatureState): (s: string) => string {
  switch (state) {
    case "REQUESTED":
      return kleur.gray;
    case "SCAFFOLDED":
      return kleur.cyan;
    case "MODEL_DONE":
    case "VM_DONE":
    case "VIEW_DONE":
      return kleur.blue;
    case "WIRED":
      return kleur.magenta;
    case "VERIFIED":
      return kleur.yellow;
    case "DONE":
      return kleur.green;
  }
}
