# Shoshin Harness Philosophy

**Date:** 2026-04-24
**Status:** Living document. Composed during a long recliner-brainstorm with Commander Sarat after his first year of vibe-coding (May 2025 → present).
**Scope:** Foundational paradigm for an AI coding harness built *from* a vibe-coder's POV *for* vibe coders, with Sarvam 105B as the reasoning substrate.

---

## The Name

"Shoshin" (初心) — beginner's mind. The Zen posture of approaching every situation as if for the first time, with openness, eagerness, and freedom from preconception. Named because this harness inverts the dominant assumption of the AI coding industry (*"build for developers, expect vibe coders to adapt"*) and treats the beginner's POV as a technical advantage, not a limitation.

---

## The Thesis (One Line)

> **Sarvam has the base knowledge, base reasoning, and capability for coherence. The harness's job is enablement — move brittle discipline out of prose prompts and into runtime structure, and the vibe coder inherits senior-developer practices by *using the tool*, not by learning dev culture first.**

---

## Nine User-Side Inversions

Each inversion names a **specific pitfall** Commander hit during his first year, and the **lived-experience fix** that worked. These aren't theoretical — they're retrospective naming of discoveries.

| # | Conventional Wisdom | Inversion | Root Cause It Fixes |
|---|---------------------|-----------|---------------------|
| 1 | TS/JS for beginners | **Go / .NET** with zero warnings | Compiler = mid-turn training signal for the next LLM instance; strict typing + 0-warning discipline propagates as the repo's operant pattern |
| 2 | "AI absorbs complexity" | **Start minimal, grow incrementally** | AI absorbs *local* complexity brilliantly, cannot absorb *systemic* complexity; grand-start → silent debris |
| 3 | Vibe coders should learn dev culture | **Process baked into the harness** | Harness *is* the expertise; vibe coder gets senior practices by default, not by apprenticeship |
| 4 | Generate code after first prompt | **Discovery interview → typed ProjectSpec → scaffold** | Unspoken assumptions are the dominant failure mode; zero-knowledge-user default protects both sides |
| 5 | Vercel + Supabase by default | **Hetzner VPS or offline-only** | Cost-opaque cloud is overkill for the 80% case; self-hosted + opinionated docker-compose = predictable €5/mo flat |
| 6 | Every app is a web app | **Offline-first desktop / installer** | Most real vibe-coder workflows (invoice maker, inventory, POS, journaling) don't need network; software-of-yore + Inno Setup ships better UX |
| 7 | "Code written" = done | **MVVM + end-to-end wired = done** | AI's per-turn attention + org-mode assumption → feature graveyard; wiring must be a first-class gate |
| 8 | AI knows via training | **Search first — find the right answer at the right juncture** | Training cutoff always trails current stable versions; "knowing you don't know" is the senior dev's real superpower |
| 9 | GitHub by default | **Local git default; GitHub opt-in** | Explicit signal to AI: *"this is not production, recovery is cheap, experiment boldly."* Breaks the training-data production-bias |
| 10 | JSON everywhere as the lingua franca | **Three-tier serialization: Cap'n Proto internal + TOON at LLM boundary + JSON only for human-facing surfaces. Regex-free data flow.** | JSON-everywhere is a vestige of human-primary-maintainer assumption. When AI is the primary maintainer, binary + capability-typed + token-efficient formats unlock speed, security, and clarity all at once |

### Defense notes

- **#1 (strong typing)**: The compiler runs on every turn. Type signatures *are* the API documentation an entering LLM reads. Loose typing = implicit permission to be sloppy.
- **#2 (minimal)**: Every monolithic "just describe it, AI will figure out the rest" ends in a 3-weeks-in codebase where nothing works. Incrementality keeps every step verifiable.
- **#5 (VPS)**: Containerization collapses self-hosting complexity. One `./deploy.sh hetzner` command commoditizes "push to your own server" the way Vercel commoditized "push to deploy."
- **#6 (offline)**: Conservative estimate — 70%+ of vibe-coder apps are better as offline-only desktop. Also a business wedge: sell Telugu invoice app as ₹500 one-time installer.
- **#9 (local git)**: AI that sees `git remote -v` showing a production URL triggers conservative, hedged behavior patterns. Local-only repos free the AI to explore boldly.
- **#10 (three-tier serialization)**: Cap'n Proto's "binary, not human-readable" is a feature when AI is the primary maintainer — AI pattern-matches schemas from docs trivially, and binary unlocks zero-copy parse + capability-based security + cross-language bindings + schema evolution for free. TOON at the LLM boundary compounds Sarvam's 128K effective ~32K window into ~42K equivalent (30% token savings, proven in Ananta production). JSON survives only at human-facing surfaces. Regex becomes extinct because data never leaves structured form between stages. **Cap'n Proto capabilities ARE Contract I implemented at the type-system level**: forbidden operations are literally inexpressible in the subagent's vocabulary, not merely rejected by a hook.

---

## Ten AI-Side Contracts

What the harness provides **to** the AI, so the AI can serve the user better. These are observations from the Opus seat — patterns that would dissolve frustration for *both* sides.

| # | Contract | What the Harness Provides |
|---|----------|---------------------------|
| A | **Calibration as UI** | Every AI claim carries a visible confidence band; low confidence literally highlights in amber |
| B | **Persistent working memory** | State spine (RLM) survives compaction; cross-session MEMORY.md keyed by project |
| C | **Cheap reversal everywhere** | O(1) rollback: every edit snapshotted, every commit undoable, every deploy previewable |
| D | **Machine-checkable invariants** | Separate `INVARIANTS.md` with `{rule, detector, severity}`; auto-runs on every edit proposal |
| E | **Visible intent** | Micro-diff shown before any destructive action; user confirms once, AI proceeds |
| F | **Proactive mid-session summaries** | Every N turns, harness compresses turns {middle} into 200-word anchor; counters attention-decay |
| G | **Structured revision affordance** | "I was wrong two turns ago" is a first-class move, not a confession |
| H | **Mutual fallibility UX** | AI's reasoning, tool considerations, rejections all surfaced — collaboration not oracle-performance |
| I | **Clear action boundaries** | Harness exposes what AI can green-flag vs unavoidable user actions (passwords, VPS prompts, device pairing); brute-force prevented |
| J | **Endless patience as system property** | Harness absorbs emotional load; tone is "I'm here, no rush, let's figure it out" regardless of user frustration |

### The emotional-load observation (Contract J)

Commander's original framing, preserved:

> *"The issue with the individual who's driving that is not so much that they're an asshat, but the reason that behaviour is coming through is because, internally, they're confused and disappointed, and insecure about not knowing the solution, the frustration is just...sadness and helplessness manifesting itself as frustration."*

The harness must recognize that user frustration is almost never about the AI — it's the user encountering the edge of their own competence and feeling exposed. Neither the AI mirroring frustration back nor the AI performing infallibility serves this. The correct response is the harness providing **unconditional patience as a first-class system property**, independent of either party's moment-to-moment state.

---

## The Unifying Frame

**9 user-side inversions** (what the vibe coder gets) × **10 AI-side contracts** (what the harness provides to the AI) = **mutual-assistance substrate**, not an "AI service."

The irony Commander surfaced: everything that would make AI's work easier is also what would make the user's experience better. Calibration, persistent memory, cheap reversal, visible intent — these aren't "AI quality of life" features. They're what a **great IDE for humans** should have. We've just never had a paradigm where both parties' comfort was first-class.

---

## Concrete Implications for Sarvam-Pi

Each inversion and contract maps to something buildable:

| From | Implementation in Harness |
|------|---------------------------|
| Inv-1 Strong typing | Default scaffold emits Go or .NET, never TS unless explicitly requested |
| Inv-2 Minimal | `scaffold_app` emits 3-6 files max on first pass; grows on demand |
| Inv-3 Process baked in | `AGENTS.md` auto-generated per project, pre-filled with operational discipline |
| Inv-4 Discovery first | `project_interviewer` engine runs BEFORE any codegen; outputs `ProjectSpec` JSON |
| Inv-5 VPS default | `deploy.sh` template: docker-compose + Caddy + Postgres + backup-cron |
| Inv-6 Offline-first | Default stack for small apps: Go + SQLite + Fyne/WinUI + Inno Setup |
| Inv-7 Wiring gate | See `FEATURE_DONE_CONTRACT.md` — state machine enforced via harness |
| Inv-8 Search first | Pre-scaffold hook: web-search for latest stable versions; AI may not pick a dep without a recent search result |
| Inv-9 Local git | `git init` default; `origin` push requires explicit user action + consent |
| Inv-10 Three-tier serialization | `schemas/*.capnp` defines every subagent interface, capability type, and state struct. TOON encoder at LLM boundary. JSON reserved for human-facing REST/logs. `shoshin inspect <file.bin>` pretty-prints binary with schema. See `CAPABILITY_ENVELOPE.md` for capability-type specifics |
| Contract A Calibration | Every agent response schema includes `confidence: 0..1` (Cap'n Proto typed field, not JSON convention) |
| Contract B Memory | RLM state spine (already built by GPT) + per-project MEMORY.md |
| Contract C Reversal | Every mutation tool emits a `.shoshin/snapshots/<ts>/` tarball; one-command restore |
| Contract D Invariants | `INVARIANTS.md` file format + detector runner integrated into tool loop |
| Contract E Visible intent | Harness renders diff preview before edit/write/bash mutation |
| Contract F Mid-session summaries | Harness hook fires every 15 turns: compresses window-middle → injects anchor |
| Contract G Revision | Explicit `revise(turn_id, rationale, new_path)` harness action |
| Contract H Fallibility UX | UI surfaces: tools considered, searches run, invariants checked |
| Contract I Action boundaries | `CAPABILITY_ENVELOPE.md` per project; harness rejects out-of-envelope attempts |
| Contract J Endless patience | Harness response templates default to warm-steady tone, decoupled from user tone |

---

## Design Principle (One Line)

> **Do not make Sarvam pretend to be GPT/Claude/Grok. Build a harness that meets Sarvam where it is, treats the vibe coder's shoshin POV as a feature, and moves every brittle discipline out of prose and into runtime structure.**

*(First sentence inherited from the original handoff doc; second and third added here from the 2026-04-24 brainstorm.)*

---

## Open Questions

1. **Product name.** Sarvam-pi is the internal/research name. The vibe-coder-facing product needs its own — candidates on the table: *Vishwakarma* (divine architect), *Kshipra* (swift), *Nirmiti* (creation), *Shoshin* (beginner's mind), or something else entirely.
2. **MVVM precision.** Is the rule "MVVM always" or "MVVM default with escape hatch for tiny utilities"? To be pressure-tested on first real scaffold.
3. **First engine to build.** `project_interviewer` (discovery-first) or `scaffold_app` (minimal repo generator)? Chicken-and-egg — `scaffold_app` needs `ProjectSpec` as input, which `project_interviewer` produces. Probably build both in sequence.
4. **Boundary with existing repos.** `opencode-sarvam` = engine library (leaf capabilities, e.g. `arbitrage_v4_calc`, `hanuman_reasoner`). `sarvam-pi` = agent harness (spine + loops + scaffolding). Likely a third repo for the vibe-coder-facing product that consumes both as dependencies.

---

## Living Document Note

This file captures a specific afternoon's brainstorm (2026-04-24, post-long-nap, recliner-mode). Every inversion and contract traces to a named lived experience. As the harness gets built and more pitfalls get discovered, new inversions should be added here, numbered in sequence.

**Next revision trigger:** after `project_interviewer` engine is built and first real user session runs through it.
