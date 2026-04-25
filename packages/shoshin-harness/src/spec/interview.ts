// Discovery interview. The PM role asks structured questions and produces a ProjectSpec.
//
// For the foundation phase, the interview runs in two modes:
//   - interactive: simple readline Q&A. No Sarvam call required for the MVP.
//   - sarvam-assisted: prompts Sarvam to interpret freeform answers into structured fields
//     (post-foundation; placeholder hook here).
//
// The interview deliberately asks the *minimum* questions. Anything else can come from
// follow-up turns once a feature is in flight.
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  APP_SHAPES,
  AppShape,
  DoneInvariant,
  DONE_INVARIANTS,
  MATH_PRIMITIVES,
  MathPrimitive,
  ProjectSpec,
  SCAFFOLD_MODES,
  ScaffoldMode,
  STORAGES,
  Storage,
  SURFACES,
  Surface,
} from "./types.js";

function asEnum<T extends readonly string[]>(allowed: T, value: string, fallback: T[number]): T[number] {
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : fallback;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function runInteractiveInterview(): Promise<ProjectSpec> {
  const rl = readline.createInterface({ input, output });
  const ask = async (prompt: string, fallback = ""): Promise<string> => {
    const ans = (await rl.question(prompt)).trim();
    return ans || fallback;
  };

  console.log("\n[shoshin] Discovery interview — 8 short questions. Press enter to accept defaults.\n");

  const name = await ask("1. Project name: ");
  if (!name) {
    rl.close();
    throw new Error("Project name is required.");
  }

  const oneLineGoal = await ask(
    "2. One-line goal (what this app does for whom): ",
  );

  const primaryUser = await ask(
    "3. Primary user (who is this for, in plain language): ",
    "small-shop owner",
  );

  const targetLanguages = splitList(
    await ask("4. Target languages (comma-separated, e.g. 'en, hi, kn'): ", "en"),
  );

  const appShapeRaw = await ask(
    `5. App shape [${APP_SHAPES.join("/")}] (default: cli): `,
    "cli",
  );
  const appShape: AppShape = asEnum(APP_SHAPES, appShapeRaw, "cli");

  const stackLang = await ask("6. Primary language (e.g. go, ts, py): ", "go");
  const stackFramework = await ask(
    "   Optional framework (e.g. fyne, htmx, fastapi): ",
    "",
  );

  const storageRaw = await ask(
    `7. Storage [${STORAGES.join("/")}] or blank for none: `,
    "",
  );
  const storage = storageRaw ? asEnum(STORAGES, storageRaw, "filesystem" as Storage) : undefined;

  const scaffoldRaw = await ask(
    `8. Scaffold mode [${SCAFFOLD_MODES.join("/")}] (default: lite): `,
    "lite",
  );
  const scaffoldMode: ScaffoldMode = asEnum(SCAFFOLD_MODES, scaffoldRaw, "lite");

  // Optional: surfaces, math primitives, invariants — short defaults; user can edit JSON later.
  const surfacesRaw = await ask(
    `9. Surfaces [${SURFACES.join(",")}] (default: cli): `,
    "cli",
  );
  const surfaces = (splitList(surfacesRaw) as Surface[]).filter((s) =>
    (SURFACES as readonly string[]).includes(s),
  );

  const mathRaw = await ask(
    `10. Math primitives to embed (comma-separated; blank = none): `,
    "",
  );
  const mathPrimitives = (splitList(mathRaw) as MathPrimitive[]).filter((m) =>
    (MATH_PRIMITIVES as readonly string[]).includes(m),
  );

  const invariantsRaw = await ask(
    `11. Done invariants [${DONE_INVARIANTS.join(",")}] (default: correct,tested,observable): `,
    "correct,tested,observable",
  );
  const doneInvariants = (splitList(invariantsRaw) as DoneInvariant[]).filter((d) =>
    (DONE_INVARIANTS as readonly string[]).includes(d),
  );

  const notes = await ask("12. Anything else (free text, optional): ", "");

  rl.close();

  return {
    name,
    oneLineGoal,
    primaryUser,
    targetLanguages,
    appShape,
    primaryStack: {
      lang: stackLang,
      framework: stackFramework || undefined,
    },
    storage,
    scaffoldMode,
    surfaces: surfaces.length ? surfaces : ["cli"],
    mathPrimitives,
    doneInvariants: doneInvariants.length
      ? doneInvariants
      : ["correct", "tested", "observable"],
    notes: notes || undefined,
    source: "interview",
    createdAt: new Date().toISOString(),
  };
}
