# Capability Envelope

**Date:** 2026-04-24
**Status:** Design spec. Companion to Inversion #10 (three-tier serialization) and Contract I (clear action boundaries).
**Dependency:** Cap'n Proto as the internal serialization layer.

---

## The Principle

Forbidden operations for a subagent must not merely be **rejected** by a hook at runtime — they must be **inexpressible** in that subagent's vocabulary.

This is the Cap'n Proto capability model applied as harness security primitive. A subagent holding `Capability<Read, Grep, WebSearch>` literally does not have a handle it can invoke to perform `Write`. There is nothing to brute-force past; the forbidden action has no name in the subagent's scope.

**Contract I was "harness exposes clear action boundaries and rejects out-of-envelope attempts." Capability envelope upgrades this to: "harness defines the subagent's universe such that out-of-envelope isn't a thing."**

---

## Capability Types (Cap'n Proto Schema Sketch)

```capnp
# schemas/capabilities.capnp

interface ReadCap {
  read @0 (path :Text) -> (content :Data);
  ls @1 (path :Text) -> (entries :List(Text));
}

interface GrepCap {
  grep @0 (pattern :Text, path :Text) -> (matches :List(Match));
}

interface WriteCap {
  # Scope is the capability's authority boundary.
  # Harness rejects any call where path is not under scope.
  scope @0 () -> (scope :Text);
  write @1 (path :Text, content :Data) -> (ok :Bool);
}

interface EditCap {
  scope @0 () -> (scope :Text);
  edit @1 (path :Text, patch :Patch) -> (ok :Bool, applied :Text);
}

interface BashCap {
  cwd @0 () -> (cwd :Text);
  timeoutMs @1 () -> (t :UInt32);
  allowedCommands @2 () -> (cmds :List(Text));  # empty = any
  exec @3 (command :Text) -> (stdout :Data, stderr :Data, exit :Int32);
}

interface WebSearchCap {
  allowedDomains @0 () -> (domains :List(Text));  # empty = any public
  search @1 (query :Text) -> (results :List(Result));
}

interface TestCap {
  scope @0 () -> (scope :Text);
  runTests @1 (path :Text) -> (passed :UInt32, failed :UInt32, output :Text);
}

interface AdvisoryCap {
  # Can propose mutations as recommendations — cannot execute them.
  propose @0 (rationale :Text, patch :Patch) -> (proposal :ProposalRef);
}

interface SpecCap {
  readSpec @0 () -> (spec :ProjectSpec);
  proposeSpecChange @1 (change :SpecChange, rationale :Text) -> (proposal :ProposalRef);
}

interface UserTalkCap {
  # Only the PM role holds this by default.
  ask @0 (question :Text, options :List(Text)) -> (answer :Text);
  notify @1 (message :Text, severity :Severity) -> ();
}

interface MemoryWriteCap {
  # Only the Librarian role holds this by default.
  updateMemoryFile @0 (name :Text, entry :Text) -> (ok :Bool);
  compact @1 (session :SessionRef) -> (summary :Text);
}

interface BlockCap {
  # Can veto a state transition (post-trust-progression feature).
  veto @0 (feature :FeatureRef, rationale :Text) -> (ok :Bool);
}
```

---

## Per-Role Default Envelopes

Defined in `.shoshin/roles.capnp` at scaffold time. The Orchestrator mints role capabilities at subagent spawn and cannot be expanded by the subagent itself.

| Role | Default Envelope |
|------|------------------|
| **Architect** | `ReadCap`, `GrepCap`, `WebSearchCap`, `AdvisoryCap`, `SpecCap<readSpec>` |
| **PM** | `ReadCap`, `SpecCap`, `UserTalkCap` |
| **Scout** | `ReadCap`, `GrepCap`, `WebSearchCap<allowedDomains=public>` |
| **Builder** | `ReadCap`, `GrepCap`, `WriteCap<scope: ticket.path>`, `EditCap<scope: ticket.path>`, `BashCap<cwd: project, allowed: [test, build, lint]>`, `TestCap<scope: ticket.path>` |
| **Reviewer** | `ReadCap`, `GrepCap`, `BashCap<cwd: project, allowed: [diff, log, test]>` |
| **QA** | `ReadCap`, `BashCap<cwd: project, allowed: [run, test]>`, `TestCap` |
| **Librarian** | `ReadCap`, `MemoryWriteCap`, `BashCap<cwd: project, allowed: [git log, git diff]>` |

Note the absence of unsafe combinations:
- Scout **has no Write or Edit**. Exploration only.
- Reviewer **has no Write or Edit**. Read + diff + advisory only.
- Architect **has no Write unilaterally** — proposes through AdvisoryCap only.
- Builder's Write/Edit is **scoped to ticket.path**. Cannot modify files outside its ticket scope.
- Builder's Bash is **allowlist-filtered** to test/build/lint commands. Cannot `rm -rf` or `curl | sh`.

---

## The User-Unavoidable Boundary

Some actions are **never green-flagged** for any subagent:

| Action | Why Never AI |
|--------|--------------|
| Entering passwords / SSH keys | Human identity + credentials |
| Interactive VPS prompts | Session ownership |
| Physical device pairing | Human presence |
| Authorization flows (OAuth consent) | Informed consent |
| Production deploys | Explicit high-risk approval ritual |
| Pushing to branches named `main` / `master` / `prod` | Publication-level consent |

The harness enforces this by **not minting capabilities for these operations at all**. There is no `PasswordEnterCap`. When the subagent encounters a process requiring it, the harness pauses, surfaces *"this requires human action: [action]; please do [thing]; I'll resume when done"*, and waits.

This prevents the "frustrated user prompts AI to brute-force through credentials and accidentally deletes data" failure mode Commander named, because **the brute-force path literally does not exist in the capability graph.**

---

## Capability Revocation and Scope Shrinking

Orchestrator can **revoke** capabilities mid-session (e.g., if a Builder attempts too many out-of-scope edits, revoke WriteCap and request review). Revocation is a Cap'n Proto primitive — the capability reference becomes unresolvable, and the subagent receives a typed error on next attempted use.

Orchestrator can **shrink scope** of a capability mid-session (e.g., Builder starts with scope=`src/invoice/` and gets shrunk to scope=`src/invoice/model/` if it's drifting). The capability reference stays valid; only the bounds tighten.

This is honeybee-style dynamic authority: the hive adjusts roles based on observed behavior, not rigid initial assignment.

---

## Migration Path from Current State

1. **Now (JSON era)**: opencode-sarvam engines + Pi tool loop use JSON everywhere. Keep as-is; legacy.
2. **New work in sarvam-pi**: All new subagent interfaces authored as `.capnp` schemas. Cap'n Proto generators emit TS/Go bindings.
3. **Hybrid phase**: Orchestrator speaks Cap'n Proto to subagents; subagents internally still call LLM with TOON-encoded prompts + receive JSON-schema responses from legacy engines; Orchestrator reifies responses into Cap'n Proto structs.
4. **Full Cap'n Proto**: Engines rewritten to emit Cap'n Proto structs directly (post-proof of harness-level benefit).

---

## Debuggability

Cap'n Proto binary is "not human-readable" — but the harness ships:

```bash
shoshin inspect <file.bin>         # pretty-print with schema
shoshin replay <session>           # step through trail.capnp actions
shoshin trace <feature>            # show which subagents touched a feature
shoshin capabilities <subagent>    # show envelope held by a subagent instance
```

AI pattern-matches `.capnp` schemas trivially from docs. The human debugging experience is served by tools, not by making the wire format ASCII. This is the right trade for the Shoshin paradigm where **AI is the primary maintainer**.

---

## Non-Negotiables

- **No capability expansion from within the subagent.** Only Orchestrator mints; subagents receive.
- **No global registry lookup for capabilities.** Handles are passed, not resolved by string. Prevents forgery.
- **No unscoped WriteCap or BashCap in any default role.** Scope is mandatory at mint time.
- **No direct human-action capability.** Passwords, OAuth, physical presence — never AI-executable.
- **Revocable and shrinkable.** Authority adjusts to observed behavior.

---

## Connection to Other Docs

- `SHOSHIN_HARNESS_PHILOSOPHY.md` — Inversion #10 + Contract I context
- `SHOSHIN_SWARM_MODEL.md` — role catalog that defines who holds what
- `FEATURE_DONE_CONTRACT.md` — capabilities required per state transition
- `TOOL_PROTOCOL.md` — existing JSON-era tool protocol, to be superseded gradually
