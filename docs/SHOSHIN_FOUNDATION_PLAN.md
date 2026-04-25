# Shoshin Foundation Plan

**Date:** 2026-04-25
**Status:** Foundation scaffolding plan. Bridges sarvam-pi (engine layer) and the Shoshin design corpus (product layer).
**Companions:** `SHOSHIN_HARNESS_PHILOSOPHY.md`, `FEATURE_DONE_CONTRACT.md`, `SHOSHIN_SWARM_MODEL.md`, `CAPABILITY_ENVELOPE.md`, `SHOSHIN_MATHEMATICAL_SUBSTRATE.md`.

---

## Where We Are

The 2026-04-24 brainstorm produced five design docs. The 2026-04-23 → 2026-04-24 sarvam-pi sprint shipped an engine layer (Experiments 001–005 passing). This plan connects them.

### Already Built (sarvam-pi engine layer)

| Capability | Package | Status |
|------------|---------|--------|
| Sarvam OpenAI-compat provider with `api-subscription-key` auth | `packages/sarvam-provider/` | Smoke 001 ✓ |
| Tool loop with mutation guards (`read`/`grep`/`find`/`ls`/`edit`/`write`/`bash`) | `packages/sarvam-tools/` | Smoke 002 ✓ |
| RLM state store (session/trajectory/context/compaction/child-call) | `packages/rlm-state/`, `rlm-state-extension/` | Smoke 003 ✓ |
| Asymmetrica runtime smoke (read-only narrow runtime tools) | — | Smoke 004 ✓ |
| Subagent spawn (scout/worker/reviewer roles) via child Pi process | `packages/sarvam-subagent-extension/` | Smoke 005 ✓ |
| Loop guards (force-synthesis after N tool results, read-repeat detector, mutation-scope policy) | embedded in provider | working |
| Native tool-call + XML-fallback parsing | `parseNativeToolCall` + `parseSarvamToolCall` | working |

### What the Engine Layer Does Not Yet Have

The engine layer is a **generic Sarvam-on-Pi runtime**. Shoshin is the **opinionated product** above it. The vibe-coder UX, Feature Done Contract, 7-role swarm, persona pairs, stigmergy substrate, time awareness, memory hydration, and ProjectSpec-driven scaffolding all live above the engine layer and do not exist yet.

---

## Foundation Scope

This plan covers the scaffolding required to **TEST how Sarvam responds to user intent through the harness end-to-end** — not the full vision, not the math catalog extraction. Just enough mass for the first real Shoshin loop to fire.

The catalog expansion + library extraction (per `SHOSHIN_MATHEMATICAL_SUBSTRATE.md` closing seed order) is the next phase after this foundation is testable.

### Definition of "Foundation Done"

A user runs:
```
shoshin init my-app
shoshin spec   # answers a few questions
shoshin morning   # generates today's tickets
shoshin run    # autonomous run; orchestrator dispatches roles
shoshin status # shows feature state machine progress
shoshin evening # reconvene + memory compaction
```

…and Sarvam-driven role agents (Architect/PM/Scout/Builder/Reviewer/QA/Librarian) actually advance one feature from REQUESTED → SCAFFOLDED → MODEL_DONE with proper trail logging, persona-pair system prompts, time awareness injection, and memory hydration on resume.

That's the bar.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Shoshin Product Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐     │
│  │ Orchestrator │  │  CLI shell   │  │  Daily Rhythm UX      │     │
│  └──────┬───────┘  └──────────────┘  └──────────────────────┘     │
│         │                                                         │
│  ┌──────▼─────────────────────────────────────────────────────┐   │
│  │  ProjectSpec │ Features │ Trail │ Memory │ Personas │ Time │   │
│  └──────┬─────────────────────────────────────────────────────┘   │
│         │                                                         │
│  ┌──────▼────────────────────────────────────────────────┐         │
│  │       Capability Envelope (Cap'n Proto-shaped)        │         │
│  │   ReadCap GrepCap WriteCap EditCap BashCap …          │         │
│  └──────┬────────────────────────────────────────────────┘         │
└─────────┼────────────────────────────────────────────────────────┘
          │
┌─────────▼─────────────────────────────────────────────────────────┐
│              sarvam-pi Engine Layer (already built)                │
│   sarvam-provider │ sarvam-tools │ rlm-state │ subagent-ext        │
│           Pi (mariozechner/pi-coding-agent) runtime                │
└────────────────────────────────────────────────────────────────────┘
                            │
                ┌───────────▼───────────┐
                │   Sarvam 105B / 30B    │
                └───────────────────────┘
```

The **product layer is a new package**: `packages/shoshin-harness/`. It depends on the engine packages, exposes a CLI, and produces `<app>/.shoshin/` artifacts in target user repositories.

---

## Phased Build Plan

Each phase is independently useful and testable. We build, smoke-test, commit, advance.

### Phase 1 — Package Bootstrap

**Deliverable:** `packages/shoshin-harness/` exists with TS scaffolding, depends on engine packages, registered in workspaces.

**Files:**
- `packages/shoshin-harness/package.json` — `@sarvam-pi/shoshin-harness`, deps on `pi-coding-agent`, `sarvam-provider` (workspace), `sarvam-subagent-extension` (workspace), `@toon-format/toon`, `commander` (CLI), `zod` (schema validation).
- `packages/shoshin-harness/tsconfig.json` — extends root.
- `packages/shoshin-harness/src/index.ts` — exports public surface.
- `packages/shoshin-harness/src/cli.ts` — `commander` entry with stub commands.
- `packages/shoshin-harness/bin/shoshin.js` — node-shebang launcher.
- `packages/shoshin-harness/README.md` — what + why + commands.

**Smoke:** `npx shoshin --help` lists commands, even if all are stubs.

### Phase 2 — ProjectSpec + Spec Interview

**Deliverable:** `shoshin spec` runs an interactive interview against Sarvam (using engine layer) and writes `.shoshin/spec.json`.

**Files:**
- `src/spec/types.ts` — `ProjectSpec` shape (zod schema).
- `src/spec/loader.ts` — read/write `.shoshin/spec.json`.
- `src/spec/interview.ts` — interview prompts + Sarvam calls; parses answers into `ProjectSpec`.
- `schemas/projectspec.capnp` — Cap'n Proto schema (design artifact; codegen later).

**Spec shape (initial fields):**
```ts
interface ProjectSpec {
  name: string;
  oneLineGoal: string;
  primaryUser: string;       // "small-shop owner"
  targetLanguages: string[]; // ["en", "hi", "kn"]
  scaffold_mode: "full_mvvm" | "lite" | "custom";
  appShape: "cli" | "desktop" | "web" | "api" | "mobile";
  primaryStack: { lang: string; framework?: string }; // {lang:"go", framework:"fyne"}
  storage?: "sqlite" | "postgres" | "spacetimedb" | "filesystem";
  surfaces: ("telegram" | "miniapp" | "pwa" | "desktop" | "cli")[];
  mathPrimitives: string[];  // ["digital_root","williams_batching","slerp_state"]
  done_invariants: string[]; // ["correct","complete","accessible","secure","observable","maintainable","tested"]
  notes?: string;
}
```

**Smoke:** Answer a 6-question interview, find a valid `.shoshin/spec.json` written to disk.

### Phase 3 — Feature State Machine

**Deliverable:** `shoshin features <list|add|status|advance>` reads/writes `.shoshin/features.json` per `FEATURE_DONE_CONTRACT.md`.

**Files:**
- `src/features/types.ts` — `Feature`, `FeatureState` enum.
- `src/features/store.ts` — read/write `.shoshin/features.json` (atomic writes, file locking).
- `src/features/transitions.ts` — state machine transitions + evidence-required checks.
- `src/features/cli.ts` — CLI subcommand wiring.

**State machine:**
```
REQUESTED → SCAFFOLDED → MODEL_DONE → VM_DONE → VIEW_DONE → WIRED → VERIFIED → DONE
```

Each transition requires evidence (file presence, test pass, etc.) per the contract doc.

**Smoke:** Add a feature, advance manually, verify state file matches expectation.

### Phase 4 — Stigmergy Trail

**Deliverable:** Every meaningful action appends one record to `.shoshin/trail.jsonl` (initially JSONL; Cap'n Proto codegen later).

**Files:**
- `src/trail/types.ts` — `TrailRecord` discriminated union: `{kind: "feature_advance" | "subagent_spawn" | "tool_call" | "user_prompt" | "memory_write" | …}`.
- `src/trail/writer.ts` — append-only writer; one record per call; ISO timestamp; subagent ID; role.
- `src/trail/reader.ts` — tail-N records, filter-by-feature, filter-by-role.
- `schemas/trail.capnp` — design-artifact schema.

**Smoke:** Run any harness command, see records appear in `.shoshin/trail.jsonl`.

### Phase 5 — Role Catalog + Persona Pairs

**Deliverable:** 7-role catalog with persona-pair system prompts; supersedes the 3-role primitive in `sarvam-subagent-extension`.

**Files:**
- `src/roles/catalog.ts` — `RoleDef` for Architect, PM, Scout, Builder, Reviewer, QA, Librarian. Each has: `name`, `concern`, `personaPair`, `defaultEnvelope` (capability list), `defaultPromptTemplate`.
- `src/roles/personas.ts` — persona definitions (Mirzakhani, Torvalds, Hopper, Angelou, Darwin, Lovelace, Ramanujan, Hamilton, Fermi, Feynman, Curie, Murphy, Borges, Knuth) with one-paragraph activation prompt each.
- `src/roles/prompt-builder.ts` — composes `system_prompt = persona_pair_activation + role_concern + envelope_summary + project_spec_brief`.
- `.shoshin/roles.json` — written at scaffold time; per-project overridable.
- `.shoshin/personas.json` — per-project persona-pair overrides.

**Smoke:** Print the system prompt for an Architect role with the default Mirzakhani+Torvalds pair against a sample ProjectSpec — verify it reads coherent.

### Phase 6 — Capability Envelope (Lightweight Runtime)

**Deliverable:** Per-role capability filtering of available tools at subagent spawn. No Cap'n Proto runtime yet; we use a TS-shaped capability bundle that maps to Pi's `--tools` flag.

**Files:**
- `src/capabilities/types.ts` — `Capability` discriminated union (`ReadCap`, `GrepCap`, `WriteCap`, `EditCap`, `BashCap`, etc.) with scope fields.
- `src/capabilities/role-envelopes.ts` — per-role default envelope objects (matches `CAPABILITY_ENVELOPE.md` table).
- `src/capabilities/to-pi-tools.ts` — translates an envelope into the comma-separated `--tools` string + scope env vars (e.g. `SARVAM_PI_MUTATION_ROOT`).
- `src/capabilities/never-mint.ts` — list of operations never minted (passwords, OAuth, prod-deploy, main-push) with friendly pause-message templates.

**Smoke:** Compute a Builder envelope from `roles.json`, verify it produces the right `--tools` string, and that adding `WriteCap<scope: "internal/feature_x/">` produces correct `SARVAM_PI_MUTATION_ROOT`.

### Phase 7 — Memory Hydration

**Deliverable:** At subagent spawn, harness loads `MEMORY.md` + `AGENTS.md` + `INVARIANTS.md` (+ relevant `.shoshin/trail.jsonl` tail), TOON-encodes the bundle, and prepends to system prompt.

**Files:**
- `src/memory/load.ts` — find files (project root + `~/.shoshin/`); read; size-bound (skip if > N KB; flag for librarian compaction).
- `src/memory/toon.ts` — wrapper around `@toon-format/toon` for memory-bundle encoding.
- `src/memory/relevance.ts` — simple keyword-match relevance against ProjectSpec to pick which memory entries to include.

**Smoke:** Spawn a Scout subagent against a sample repo with a populated `MEMORY.md`; verify the system prompt contains TOON-encoded relevant memories.

### Phase 8 — Time Awareness

**Deliverable:** Periodic injection of `[session turns | elapsed | repo age | feature pace]` into orchestrator context, every N turns or on state transition.

**Files:**
- `src/time/pulse.ts` — computes pulse string from session start, current time, `git log -1`, and feature-state-transition rate.
- `src/time/hook.ts` — orchestrator hook fired on each turn; injects pulse if N turns elapsed.

**Smoke:** Run a 5-turn synthetic loop; verify pulse appears every 3 turns (or whatever cadence we pick).

### Phase 9 — Orchestrator Core Loop

**Deliverable:** Single TS module that ties Phases 1-8 together. Reads spec, hydrates memory, dispatches role subagents, logs trail, advances features, persists state.

**Files:**
- `src/orchestrator/loop.ts` — main loop.
- `src/orchestrator/dispatch.ts` — given a ticket, choose the right role; call `sarvam-subagent-extension` with the role's envelope + persona prompt + memory bundle.
- `src/orchestrator/ticket-gen.ts` — given the daily plan, decompose into tickets.

**Smoke:** Manually create one ticket, dispatch it to a Builder subagent against a sample ProjectSpec, see it advance one feature from REQUESTED → SCAFFOLDED with proper evidence, trail records written.

### Phase 10 — Daily Rhythm CLI

**Deliverable:** `shoshin morning` / `shoshin evening` flows wire orchestrator + ticket gen + memory compaction.

**Files:**
- `src/rhythm/morning.ts` — interactive plan-of-day flow; produces today's tickets; commits trail record.
- `src/rhythm/evening.ts` — reconvene flow: gather completed tickets + trail tail; ask Sarvam to write summary as `MEMORY.md` candidate; user approves; Librarian role compacts.
- `src/rhythm/run.ts` — `shoshin run` autonomous mode — orchestrator loops without human input until tickets exhausted or cap hit.

**Smoke:** Morning → run → evening on a sample empty repo with one fake feature; full cycle completes without errors; `MEMORY.md` updated with end-of-day note.

### Phase 11 — Foundation Smoke

**Deliverable:** `experiments/006-shoshin-foundation-smoke/` runs the full Phase 1-10 stack against a disposable fixture and verifies the loop.

**Acceptance:**
- ProjectSpec interview produces valid `.shoshin/spec.json`
- One feature advances REQUESTED → MODEL_DONE via real Sarvam calls
- Trail has ≥10 typed records
- Memory hydration injects a known sentinel from a fixture `MEMORY.md`
- Time pulse fires at expected cadence
- Persona-pair system prompt visible in trail metadata
- No mutation-policy violations
- Total wall time logged

---

## What This Foundation Plan Excludes

These are **next-phase** items, not foundation:

- **Math primitive library extraction** (Vedic, Williams, SLERP, etc.) — covered by `SHOSHIN_MATHEMATICAL_SUBSTRATE.md` seed order.
- **Cap'n Proto runtime codegen** — schemas exist as design artifacts; full codegen + RPC wiring is post-foundation.
- **Trust progression** — fixed roles only; trust accumulation is post-v1 per `SHOSHIN_SWARM_MODEL.md`.
- **Quorum dispatch** — single-subagent-per-ticket only; quorum is opt-in, post-foundation.
- **App scaffolding generators** — `internal/math/<primitive>.go` extraction + `scaffold_mode` template emission is post-foundation.
- **ACE EYES integration** — QA role uses placeholder `bash test` until ACE EYES wired in as default tool.
- **VQC Indexer wiring** — subagent spawn primitive lookup will use it later; for now, role catalog is the lookup.
- **Lean proof template generation** — post-foundation.

---

## File Layout (Target)

```
sarvam-pi/
├── packages/
│   ├── sarvam-provider/          (engine — exists)
│   ├── sarvam-tools/             (engine — exists, partial)
│   ├── sarvam-subagent-extension/(engine — exists)
│   ├── rlm-state/                (engine — exists)
│   ├── rlm-state-extension/      (engine — exists)
│   └── shoshin-harness/          (NEW — product layer)
│       ├── bin/
│       │   └── shoshin.js
│       ├── schemas/
│       │   ├── projectspec.capnp     (design artifact)
│       │   ├── trail.capnp           (design artifact)
│       │   └── capabilities.capnp    (design artifact)
│       ├── src/
│       │   ├── index.ts
│       │   ├── cli.ts
│       │   ├── orchestrator/
│       │   ├── spec/
│       │   ├── features/
│       │   ├── trail/
│       │   ├── roles/
│       │   ├── personas/
│       │   ├── capabilities/
│       │   ├── memory/
│       │   ├── time/
│       │   └── rhythm/
│       ├── package.json
│       ├── tsconfig.json
│       └── README.md
├── experiments/
│   ├── 001-provider-smoke/       (done)
│   ├── 002-tool-loop-smoke/      (done)
│   ├── 003-rlm-state-smoke/      (done)
│   ├── 004-asymm-runtime-smoke/  (done)
│   ├── 005-subagent-smoke/       (done)
│   └── 006-shoshin-foundation-smoke/ (NEW — foundation acceptance)
└── docs/
    ├── (existing design docs)
    └── SHOSHIN_FOUNDATION_PLAN.md (this file)
```

---

## Build Order

Strictly sequential within these clusters; parallel-safe between clusters.

**Cluster A (sequential):** 1 → 2 → 3 → 4
**Cluster B (sequential, depends on A complete):** 5 → 6 → 7 → 8
**Cluster C (sequential, depends on A and B):** 9 → 10 → 11

This gives a natural commit cadence: commit per phase, push at cluster boundaries (3 commits to main per cluster + 1 per merge).

---

## Risks + Mitigations

| Risk | Mitigation |
|------|-----------|
| Sarvam tool-call format drift breaks orchestrator | Engine layer already has native + XML parsing; orchestrator inherits resilience |
| Memory hydration explodes prompt budget | Size bound + relevance filter + Librarian compaction loop |
| 7-role spawn cost (latency/quota) | Phase 9 starts with Architect+Builder+QA only; full 7 spawn after first smoke |
| Persona pairs feel gimmicky in output | Empirical validation — read trail metadata; A/B test with persona on/off in smoke |
| `.shoshin/` dir bloats fast | Trail is JSONL append; rotate at N MB; compaction is Librarian's job |
| Auth scope creep — Sarvam touches files outside ticket | Mutation-scope env var + capability envelope filter; engine layer already enforces |
| Cap'n Proto codegen lag | Schemas as design artifacts only for now; TS types are source of truth until codegen wired |

---

## Success Definition for the Foundation

When Commander returns and runs `shoshin morning && shoshin run && shoshin evening` against a fresh fixture project, and:

1. The flow completes with exit code 0
2. `.shoshin/features.json` shows at least one feature advanced two states
3. `.shoshin/trail.jsonl` has ≥20 typed records
4. `.shoshin/spec.json` is valid against the zod schema
5. The Sarvam-generated output uses the persona-pair voice (visible in trail metadata)
6. The wall time is logged and reasonable (< 10 minutes for the fixture)

…then the foundation is **testable**, and tomorrow's catalog expansion + library extraction has a substrate to land on.

---

## Closing

This plan is a bridge, not a vision. The vision lives in the five design docs from yesterday. This is the scaffold that lets us **execute** that vision against real Sarvam responses — the moment when philosophy meets implementation.

> Build → Test → Ship.
