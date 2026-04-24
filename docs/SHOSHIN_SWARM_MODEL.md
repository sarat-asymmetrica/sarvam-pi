# Shoshin Swarm Model

**Date:** 2026-04-24
**Status:** Design-phase; companion to `SHOSHIN_HARNESS_PHILOSOPHY.md`.
**Source:** 2026-04-24 recliner-brainstorm.

---

## Thesis (One Line)

> **The system is a time-aware mini-software-org operating on swarm principles, where specialized role-agents embodying persona-pairs coordinate via shared environment (stigmergy), make quorum decisions on uncertainty, accumulate trust through successful role execution, maintain persistent mycelial memory across sessions, and run on a daily rhythm of plan → autonomous execution → reconvene.**

Every word in that sentence is load-bearing. This document unpacks each clause and maps it onto concrete harness features.

---

## Why Biomimicry Is the Right Lens

Honeybees, ants, and mycelium all solve the *same engineering problem* we face: **how does a collective of bounded-attention agents accomplish something none of them individually has context for?** Nature converged on three independent answers that are directly applicable:

| Organism | Mechanism | Maps To |
|----------|-----------|---------|
| **Honeybees** | Waggle-dance structured broadcast + quorum sensing + age-based role progression | Shared scratch space + N-scout agreement + trust accumulation |
| **Ants** | Stigmergy — coordination via shared environment, not direct message | Repo state + git log + state files as pheromone trails |
| **Mycelium** | Persistent underground network + transient fruiting bodies + bidirectional resource flow + fault-tolerant rerouting | MEMORY.md + per-session subagents + context ↔ capability trade + failure rerouting |

**These are not metaphors.** Billions of years of evolution converged on structured compact message-passing, distributed verification, and environment-mediated coordination. We are recognizing solutions, not inventing them.

---

## 1. Role Catalog (The Mini-Software-Org)

Seven roles, each with a distinct **concern**, **tool envelope**, and **persona pair**.

| Role | Concern | Tool Envelope (Cap'n Proto capabilities) | Persona Pair | Notes |
|------|---------|-------------------------------------------|--------------|-------|
| **Architect** | System shape, invariants, trade-offs, vetoes | `ReadCap`, `GrepCap`, `SearchCap`, `AdvisoryCap` (can recommend but rarely mutates) | **Mirzakhani + Torvalds** | Topology + systems pragmatism |
| **PM** | Intent, requirements, state-between-sessions, plain-language translation | `ReadCap`, `SpecCap`, `UserTalkCap` | **Grace Hopper + Maya Angelou** | Clarity + meet-user-where-they-are |
| **Scout** | Exploration — patterns, emerging libs, prior art | `ReadCap`, `GrepCap`, `WebSearchCap`, `ReportCap` | **Darwin + Ada Lovelace** | Observe broadly + see patterns |
| **Builder** | Bounded-scope execution against a ticket | `ReadCap`, `WriteCap<scope: Path>`, `EditCap<scope: Path>`, `BashCap`, `TestCap` | **Ramanujan + Margaret Hamilton** | Insight + discipline |
| **Reviewer** | Diff inspection for gaps, fragility, convention drift | `ReadCap`, `DiffCap`, `BashCap` | **Fermi + Feynman** | Sanity check + find the flaw |
| **QA** | VERIFIED gate — end-to-end evidence | `ReadCap`, `RunCap`, `TestCap`, `UICap<readonly>` | **Marie Curie + Murphy** | Rigorous verification + whatever-can-go-wrong |
| **Librarian** | Memory taxonomy, compaction, archival | `ReadCap`, `MemoryWriteCap`, `CompactionCap` | **Borges + Knuth** | Memory architecture + taxonomy discipline |

### Persona Pairing as Activation Mechanism

Single-persona activation gets capture-biased to one register. **Pairing creates internal dialectic** that mirrors real engineering tension. Empirically proven in Commander's environment (e.g., Ramanujan + Hamilton used productively over many sessions).

System prompt convention:
```
You are embodying {persona_a} + {persona_b} in the role of {role}.
Your concern is {concern}. Your tool envelope is {capabilities}.
```

Personas are **overridable per project**. A user who prefers different cognitive flavors edits `.shoshin/personas.capnp` and the harness re-activates with new pairings. Defaults are seeds, not doctrine.

---

## 2. Stigmergy Protocol — Environment-Mediated Coordination

Subagents **do not message each other directly**. They read the repo state, and their next action is informed by what's visibly strongest. This is ant-colony optimization applied to code.

### Pheromone Trails in the Harness

| Substrate | What it carries | Where written |
|-----------|-----------------|---------------|
| **Git commit history** | High-level work progression, authorship, rationale | Every meaningful state advance commits |
| **`.shoshin/trail.capnp`** | Fine-grained subagent action log (binary, typed, append-only) | Every subagent action appends one Cap'n Proto record |
| **`.shoshin/features.json`** | Feature state machine truth (REQUESTED → DONE) | Updated on every state transition |
| **File structure itself** | The code IS the pheromone — what exists signals what's done | Always |
| **`AGENTS.md` delta** | Conventions discovered and codified mid-project | Librarian role updates on accumulation |

Next subagent entering the system reads the trail tail (last N records), scans git log, checks feature states. Coordination is **implicit via shared substrate**, not explicit via message bus.

---

## 3. Quorum for Uncertainty

Borrowed from honeybee decision-making: decisions ratify only when enough independent observations agree.

**When to apply quorum:**
- Picking a dependency (multiple Scouts search web independently; converge on stable choice)
- Choosing an architectural approach (multiple Architects propose; Orchestrator picks from highest-overlap suggestions)
- High-confidence classification on tool dispatch (vote among N classifier calls)

**When NOT to apply quorum:**
- Pure arithmetic (use `calc_plan` engine instead — deterministic solver, not voting; see `opencode-sarvam` negative result on majority voting)
- Direct syntax work (Builder executes, doesn't vote)
- User-facing communication (always single-voiced)

The negative result from opencode-sarvam is the guardrail: **quorum helps with genuine uncertainty; it does NOT fix systematic error.**

---

## 4. Trust Progression (Age-Based Role Advancement)

Honeybees do this: young bees nurse, older bees forage, oldest bees scout. Role shifts with accumulated state.

**Proposed mechanism** (to be validated — start fixed, add progression if base loop stable):

- A Builder who successfully completes N features to VERIFIED unlocks **Architect advisory capability** (still can't mutate architecture unilaterally, but can propose structural changes).
- A Scout whose recommendations have been accepted M times unlocks **SearchCap with broader scope** (can search private sources, not just public docs).
- A Reviewer whose findings have caught real bugs unlocks **Block capability** (can veto a merge instead of only flagging).

Trust is **recorded per-project in `.shoshin/trust.capnp`**. Cross-project trust is NOT automatic — a Builder who earned Architect-advisory in project A starts fresh in project B. (Humility by default.)

**This is experimental.** Ship fixed-role first. Trust progression is a post-v1 feature.

---

## 5. Mycelial Memory (Persistent Substrate)

Subagents are **fruiting bodies**: spawn, do work, dissolve. Memory is the **mycelial network**: persists underground across sessions.

Substrate layers:

| Layer | Persistence | Content |
|-------|-------------|---------|
| **Active context** | This session | RLM state spine, current feature focus, recent tool results |
| **Session log** | This session + recoverable | `trail.capnp` full JSONL equivalent, commit history |
| **Project memory** | Forever, project-scoped | `MEMORY.md`, `AGENTS.md`, `INVARIANTS.md`, `schemas/*.capnp` |
| **User-lifetime memory** | Forever, cross-project | `~/.shoshin/user.capnp` — preferences, persona overrides, learned patterns |

Fault-tolerance comes for free: if a Builder subagent fails, Orchestrator respawns with more context (read mycelial state first). No state loss.

---

## 6. Time Awareness as System Property

**Periodic, not per-turn.** Every N turns or on state transition, the harness injects:

```
[session: 23 turns | elapsed: 1h14m | repo age: 3d since last commit | feature pace: 2.1/hr]
```

**For the AI:**
- Notice drift when session runs long; suggest summary
- Flag when task takes longer than similar past task (calibration)
- Time-box experiments explicitly

**For the user:**
- Honest progress: "At current pace, the app reaches DONE in ~6 sessions"
- Burnout awareness: "You've worked 4 hours; consider a break"
- Auto-calibration: Harness learns *your* pace over weeks

**For cross-session continuity:**
- Repo age surfaces caution level (47-day-old repo → more scouting; 2-hour-old repo → faster execution)

Implementation: `date` at session start + periodic `time_pulse` hook + state-transition timestamps. Cheap instrumentation; massive accumulation benefit.

---

## 7. Daily Rhythm

Teams have cadence. Most AI tools don't. Shoshin runs on:

**Morning (human + Orchestrator):**
- Plan-of-day session
- User describes what matters today
- Orchestrator proposes concrete objectives mapped to features in specific states
- Negotiation → agreement → ticket generation

**Day (autonomous):**
- Orchestrator dispatches subagents against tickets
- Parallel where possible (e.g., Scout + Builder on independent features)
- State machine advances, evidence accumulates
- Orchestrator watches, course-corrects, re-dispatches
- User is free to do other things, drop in, or ignore entirely

**Evening (human + Orchestrator):**
- Reconvene
- What advanced? What's blocked? What surprised us?
- Commit summary → MEMORY.md entries → seeds for next morning
- Librarian role runs compaction + archival

This is **new UX for AI coding**: AI as a team you brief and check in with, not a tool you drive turn-by-turn. Plays to AI strengths (persistent focus, parallelism, compute speed) and human strengths (judgment, intent, course correction).

---

## Implementation Order

1. **Role catalog + persona seeds** — write `.shoshin/roles.capnp` and `.shoshin/personas.capnp` with defaults
2. **Trail protocol** — append-only Cap'n Proto log, per-subagent writes
3. **Time-awareness hook** — periodic context injection
4. **Fixed-role dispatch** via Orchestrator — no trust progression yet
5. **Quorum mechanism** — optional per-dispatch flag for uncertainty-heavy work
6. **Daily rhythm UX** — plan/reconvene templates and prompts
7. **Trust progression** — post-v1, after base loop proven

Each stage independently useful; each stage usable without later stages.

---

## Non-Negotiables

- **No central message bus for subagent coordination.** Stigmergy only. Shared substrate is the medium.
- **No generic "subagent" type.** Every subagent has a role, a persona pair, and a capability envelope.
- **No quorum-as-fix for systematic errors.** Use calc_plan-style deterministic delegation for anything arithmetic.
- **No assigned trust.** Trust is earned per-project through accumulated successful outcomes, not granted by config.
- **No timeless system.** Every session knows the time, the repo age, and the pace.

---

## Open Design Questions

1. Should Architect and PM collapse into one role? They share some concerns (system thinking + user understanding) but diverge significantly in output (structural decisions vs. intent elicitation). My current lean: keep separate.
2. Should Builder specialize by language (Go-Builder, .NET-Builder)? Risk of over-fragmentation. My current lean: single Builder with language context in ticket.
3. Should Librarian run continuously as a background process, or batched end-of-session? My current lean: batched end-of-session; continuous risks writes racing with active subagents.
4. How many parallel subagents before coordination overhead exceeds benefit? Needs measurement. Start with max 3 parallel; tune from observation.
