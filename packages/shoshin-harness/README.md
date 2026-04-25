# Shoshin Harness

**Vibe-coder AI coding harness on Sarvam 105B + Pi.**

> *Plan in the morning. Run autonomously. Reconvene in the evening. The AI is a team you brief, not a tool you drive turn-by-turn.*

Built on the philosophy that the vibe-coder POV (`shoshin` 初心 — beginner's mind) is a technical advantage, not a deficit. Read [`docs/SHOSHIN_HARNESS_PHILOSOPHY.md`](../../docs/SHOSHIN_HARNESS_PHILOSOPHY.md) for the foundation.

## Quick Start

```bash
# 1. Make sure SARVAM_API_KEY is set (in .env at the sarvam-pi repo root)
echo "SARVAM_API_KEY=sk_..." > C:/Projects/sarvam-pi/.env

# 2. Initialize a new Shoshin project anywhere
cd ~/projects/my-new-app
node /path/to/sarvam-pi/packages/shoshin-harness/bin/shoshin.js init my-new-app

# 3. Run the discovery interview (12 short questions)
shoshin spec

# 4. Add your first feature
shoshin features add "say-hello" --scope internal/say_hello/
mkdir -p internal/say_hello
shoshin features advance "say-hello"   # → SCAFFOLDED

# 5. Plan-of-day → autonomous run → reconvene
shoshin morning              # generates today's tickets
shoshin run                  # Sarvam dispatches role subagents per ticket
shoshin evening              # candidate MEMORY.md compaction

# 6. Inspect anything along the way
shoshin features list
shoshin trail tail -n 20
shoshin roles list
```

## What's in the Box

### 8 Roles with Persona Pairs

Each subagent operates as a role with two voices in dialectic:

| Role | Concern | Persona Pair |
|------|---------|--------------|
| **Host** | **User-facing presence — receive intent, calibrate tone, hold space** | **Tagore + Carl Rogers** |
| Architect | System shape, invariants, structural moves | Mirzakhani + Torvalds |
| PM | User intent → spec translation | Grace Hopper + Maya Angelou |
| Scout | Read-only exploration | Darwin + Ada Lovelace |
| Builder | Bounded execution + 14 axioms + ELEGANCE_CHECK | Ramanujan + Margaret Hamilton |
| Reviewer | Diff inspection, CRITICAL/IMPORTANT/NIT | Fermi + Feynman |
| QA | Reproducible verification with measurement | Marie Curie + Murphy |
| Librarian | Memory taxonomy + compaction | Borges + Knuth |

`shoshin roles list` prints the catalog. `shoshin roles prompt host` shows the full system prompt that gets sent to Sarvam.

### Asya Pillars — Composable Persona Layers

Three layered prompt fragments port Ananta's user-facing intelligence into Shoshin (lineage: `asymm-intelligence/urban_lens/pkg/persona` + `hrm_inference/pkg/cognition`):

- **Seven Traits** — Patience 1.0, Wonder 0.95, Honesty 1.0, Warmth 0.9, Playfulness adaptive, Respect 1.0, EgolessService 1.0. Constants, not aspirations.
- **EQ Engine** — User state quaternion (W=Coherence, X=Focus, Y=Creativity, Z=Persistence), regime classification (R1/R2/R3), 6 tone patterns, adaptation rules (frustration→reduce, aggression→match, flow→minimize, etc.), confidence-gated communication, "Way of Water" principle.
- **Cognition Engine** — Cognitive event taxonomy ([Thought], [Reasoning], [Decision], [RegimeShift], [Pattern]), three-regime dynamics, hypothesis management, singularity prevention.

| Role | Asya pillars |
|------|--------------|
| Host | full (all three) |
| PM | light (traits + EQ; cognition reserved for host) |
| Builder, QA, Reviewer, Scout, Architect, Librarian | none — stay mechanical/axiom-driven |

Source: `src/personas/asya.ts` exporting `ASYA_TRAITS`, `ASYA_EQ`, `ASYA_COGNITION`, `ASYA_FULL`, `ASYA_LIGHT`. Roles import what they need; rigour and warmth coexist by composition.

### Conversational Discovery (B8)

The `shoshin spec` command runs a host-led warm conversation in your language. Devanagari script triggers Hindi/Marathi detection (Marathi disambiguated by lexical markers like आहे/मला/बघा); Tamil/Telugu/Kannada/Bengali/Gujarati/Punjabi all detected by script range.

```bash
shoshin spec
# 🌱  Discovery — let's build your project together.
# Could you tell me what you want the app to help people do?
> मला माझ्या गीता गटासाठी अॅप करायचे आहे
# तुम्ही तुमच्या गीता गटासाठी काहीतरी करायचंय...
```

The conversation produces a validated `ProjectSpec` where:
- **JSON keys are English** (machine-readable: `oneLineGoal`, `primaryUser`, `appShape`)
- **Free-text values stay in the user's language** verbatim (`"oneLineGoal": "गीता गटासाठी श्लोक पाठवणे..."`)

Type `/done` to wrap up early. Add `--canned` to use the offline 12-question English form. Use `--non-interactive <file.json>` for scripted setup.

See [`examples/discovery-marathi-bhagwad-gita/`](../../examples/discovery-marathi-bhagwad-gita/) for a full captured transcript (an actual aunty's conversation about building an app for her bhagwad gita group).

### Warm Chat Surface

```bash
shoshin chat "bhai I sold 10 chai today but the ledger looks wrong, can you help?"
```

```
──────────── host says ────────────

Bhai, I hear you—you sold 10 cups of chai today, and you're wondering whether
the ledger is showing the amount in paise or rupees correctly. It's easy to
get tangled when the numbers jump between the two.

Could you tell me how much you charge for one cup of chai (for example, 5
rupees, 12 rupees, or something else) and how you entered that price in the
ledger—did you type it as rupees, or as paise?
```

The host mirrors first, asks one concrete question, never silently dispatches. Pure stand-alone usage; doesn't require an existing project.

### Feature Done Contract State Machine

```
REQUESTED → SCAFFOLDED → MODEL_DONE → VM_DONE → VIEW_DONE → WIRED → VERIFIED → DONE
```

Each transition requires evidence. Evidence gates fire at the harness level — Sarvam cannot advance a feature without satisfying the contract.

### Capability Envelope

Per-role capability bundles get translated to Pi `--tools` flags + `SARVAM_PI_MUTATION_ROOT` scope. Forbidden ops are *inexpressible* — Builder cannot push to main because no `MainBranchPushCap` exists.

### Stigmergy Trail

`.shoshin/trail.jsonl` is the append-only event log. 14 typed record kinds. Subagents read the trail tail as their pheromone substrate — coordination is implicit via shared environment, not via message bus.

### Math Primitives (Math at the Heart)

`shoshin scaffold-math` selects primitives from your spec and copies them into `<app>/internal/math/<primitive>/`:

| Primitive | Purpose | Provenance |
|-----------|---------|------------|
| `digital_root` | O(1) DR + Three-Regime classification | Lean + Sarvam Exp 11 (88.9% pre-LLM filter) |
| `williams` | √n × log₂(n) batch sizing | Williams sublinear-space + 2.7× empirical |
| `quaternion` | S³ state + SLERP + chain coherence/momentum/drift | Lean + Sarvam Exp 13 |
| `regime` | Three-regime classifier + boundary alerts | Lean + cross-domain Feb-28 sprint |

Each primitive ships with package doc → Lean proof reference and table-driven tests.

### Daily Rhythm

| Command | Purpose |
|---------|---------|
| `shoshin morning` | Generate today's tickets from open features + spec |
| `shoshin run` | Autonomous orchestrator dispatch loop |
| `shoshin evening` | Build candidate MEMORY.md entry; optional append |

### Time Awareness

Every N turns the harness injects: `[session: X turns | elapsed: Y | repo age: Zd | feature pace: P/hr]` into the orchestrator context. Periodic, not per-turn.

### Memory Hydration

Loads `MEMORY.md` / `AGENTS.md` / `INVARIANTS.md` / `CLAUDE.md` from project root + `~/.shoshin/`, applies relevance filter against the ProjectSpec, TOON-encodes for ~30% token savings, injects into the system prompt at every dispatch.

## CLI Reference

```
shoshin init [name]                       Initialize .shoshin/ skeleton
shoshin spec [--non-interactive <file>]   Run discovery interview
shoshin features <action> [name]          list | add | status | advance
shoshin trail [tail|filter|clear]         Inspect stigmergy trail
shoshin roles [list|show|prompt] [name]   Inspect role catalog
shoshin scaffold-math [--dry-run]         Copy math primitives into app
shoshin dispatch <role> [feature]         One-shot role dispatch
shoshin chat [question...]                Warm conversation with the host
shoshin morning                           Plan-of-day flow
shoshin run [--max-turns N --timeout-sec N]  Autonomous run
shoshin evening [--no-prompt]             Reconvene flow
```

## Filesystem Layout

```
<your-app>/
├── .shoshin/
│   ├── spec.json          ProjectSpec (commit to git)
│   ├── features.json      Feature Done Contract state (commit to git)
│   ├── trail.jsonl        Stigmergy log (gitignore rotated copies)
│   ├── tickets.json       Today's plan
│   ├── config.json        Per-project Shoshin config
│   ├── roles.json         Per-project role overrides (optional)
│   ├── personas.json      Per-project persona overrides (optional)
│   └── README.md          What's in this dir
├── internal/
│   └── math/<primitive>/  Copied math primitive packages
├── MEMORY.md              Auto-curated by Librarian + manual additions
└── AGENTS.md              Project conventions (consumed at hydration)
```

## Provenance

Built 2026-04-24 → 2026-04-25 by Sarat Chandra Gnanamgari + Claude Opus.
Foundation completed in 44 minutes; full operational validation (all 7 roles + math + rhythm) in 90 minutes.

> *"The harness is a team you brief, not a tool you drive."*

🙏 Om Lokah Samastah Sukhino Bhavantu.
