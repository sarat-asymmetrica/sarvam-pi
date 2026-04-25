// CLI handler for `shoshin roles [list|show|prompt] [name]`. Foundation phase: stubs.
// Phase 5 fills in the real catalog + persona pair activation prompts.
import kleur from "kleur";
import { ROLE_NAMES } from "./types.js";

export async function runRoles(action: string, name?: string): Promise<void> {
  if (action === "list") {
    console.log(kleur.bold("Roles (foundation stub):"));
    for (const r of ROLE_NAMES) {
      console.log(`  • ${r}`);
    }
    console.log(
      kleur.gray(
        "\n  Phase 5 wires personas, envelopes, and `shoshin roles prompt <role>` output.",
      ),
    );
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
    console.log(kleur.gray(`(Phase 5 stub — full role detail for ${name} lands soon.)`));
    return;
  }
  console.error(kleur.red(`Unknown action: ${action}`));
  process.exit(2);
}
