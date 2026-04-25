// CLI handler for `shoshin roles [list|show|prompt] [name]`.
import kleur from "kleur";
import { ROLE_NAMES, RoleName } from "./types.js";
import { getRole, ALL_ROLES } from "./catalog.js";
import { getPersona } from "../personas/catalog.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { readSpec } from "../spec/store.js";

export async function runRoles(action: string, name?: string): Promise<void> {
  if (action === "list") {
    console.log(kleur.bold("Shoshin role catalog (7 roles):\n"));
    for (const r of ALL_ROLES) {
      const role = getRole(r);
      const [a, b] = role.personaPair;
      const pa = getPersona(a);
      const pb = getPersona(b);
      console.log(kleur.cyan(`  ${role.name}`));
      console.log(`    concern:  ${role.concern}`);
      console.log(`    personas: ${pa.shortLabel} + ${pb.shortLabel}`);
      console.log(`    envelope: ${role.defaultEnvelope.join(", ")}`);
      console.log("");
    }
    return;
  }

  if (action === "show" || action === "prompt") {
    if (!name) {
      console.error(kleur.red(`usage: shoshin roles ${action} <role>`));
      process.exit(2);
    }
    if (!(ROLE_NAMES as readonly string[]).includes(name)) {
      console.error(kleur.red(`Unknown role: ${name}. Try one of: ${ROLE_NAMES.join(", ")}`));
      process.exit(2);
    }
    const role = getRole(name as RoleName);

    if (action === "show") {
      const [a, b] = role.personaPair;
      const pa = getPersona(a);
      const pb = getPersona(b);
      console.log(kleur.bold(role.name.toUpperCase()));
      console.log(kleur.gray(`  ${role.concern}\n`));
      console.log(kleur.bold("Persona pair:"));
      console.log(`  ${kleur.cyan(pa.shortLabel)}\n    ${pa.activation}\n`);
      console.log(`  ${kleur.cyan(pb.shortLabel)}\n    ${pb.activation}\n`);
      console.log(kleur.bold("Default envelope:"));
      console.log(`  ${role.defaultEnvelope.join(", ")}\n`);
      console.log(kleur.bold("Prompt template:"));
      console.log(role.promptTemplate);
      return;
    }

    if (action === "prompt") {
      const spec = (() => {
        try {
          return readSpec();
        } catch {
          return null;
        }
      })();
      const prompt = buildSystemPrompt({
        role: name as RoleName,
        spec,
        ticketBrief: "[ticket brief would go here at dispatch time]",
        scopePath: "[scope path injected at dispatch time]",
        timePulse: "[time pulse injected at dispatch time]",
      });
      console.log(prompt);
      return;
    }
  }

  console.error(kleur.red(`Unknown action: ${action}. Try: list | show | prompt`));
  process.exit(2);
}
