// User-unavoidable boundary. Operations that are never minted as capabilities for
// any subagent. When a subagent's plan would require one, the orchestrator pauses
// and surfaces a human-action message. This is the architectural form of the
// Contract I principle: forbidden ops have no handle.
//
// See docs/CAPABILITY_ENVELOPE.md "User-Unavoidable Boundary" table.
import { NeverMinted } from "./types.js";

const FRIENDLY_PROMPTS: Record<NeverMinted, { reason: string; ask: string }> = {
  password_entry: {
    reason: "Password entry requires human identity + credentials.",
    ask: "Please enter the password yourself; I will resume when the prompt is done.",
  },
  ssh_key_use: {
    reason: "SSH key use is bound to your machine; agents do not hold keys.",
    ask: "Please run the SSH operation yourself; tell me when it's complete.",
  },
  vpn_unlock: {
    reason: "VPN unlock is a session-ownership operation.",
    ask: "Please unlock the VPN; I'll continue when you confirm.",
  },
  oauth_consent: {
    reason: "OAuth consent requires informed human consent at the provider's UI.",
    ask: "Please complete the OAuth consent flow in your browser; paste the redirect token back here.",
  },
  physical_pairing: {
    reason: "Physical device pairing requires human presence at the device.",
    ask: "Please pair the device physically; I'll resume after.",
  },
  production_deploy: {
    reason: "Production deploys are explicit high-risk approvals.",
    ask: "Please confirm the deploy yourself with the deploy command; I'll watch logs after.",
  },
  main_branch_push: {
    reason: "Pushing to main is a publication-level decision.",
    ask: "Please push to main yourself; I'll continue once you confirm the push succeeded.",
  },
  master_branch_push: {
    reason: "Pushing to master is a publication-level decision.",
    ask: "Please push to master yourself; I'll continue once you confirm the push succeeded.",
  },
  prod_branch_push: {
    reason: "Pushing to prod is a publication-level decision.",
    ask: "Please push to prod yourself; I'll continue once you confirm the push succeeded.",
  },
};

export function pauseMessage(op: NeverMinted): string {
  const f = FRIENDLY_PROMPTS[op];
  if (!f) {
    return `[shoshin] This action requires human consent: ${op}`;
  }
  return [
    `[shoshin] Pausing — this action is not AI-executable.`,
    `Why: ${f.reason}`,
    `What I need from you: ${f.ask}`,
  ].join("\n");
}
