# Shoshin Reliability Roadmap

**Synthesis date**: 2026-04-25
**Author**: Claude Opus 4.7 (synthesizer), drawing from three research subagents (B9-T1/T2/T3)
**Source documents** (read these for evidence; this doc cites them):
- `docs/research/B9_T1_industry_survey.md` — industry survey (Aider/Cursor/Continue/Cline/OpenHands/Devin/Claude Code)
- `docs/research/B9_T2_pi_internals_map.md` — Pi internals deep-dive
- `docs/research/B9_T3_asymmetrica_assets.md` — Asymmetrica assets inventory

This document is the source of truth for Shoshin's reliability roadmap from Bundle B10 onwards. It replaces ad-hoc bundle planning with a researched sequence grounded in three independent evidence bases. Every recommendation traces back to at least one source doc; convergent recommendations (where two or three tracks agree) are flagged.

---

## The Convergent Picture

The three research tracks were deliberately non-overlapping by source material — T1 read the public web, T2 read `pi-mono/` source, T3 read the wider Asymmetrica monorepo. **Where they agree, the agreement is meaningful** (no copying possible). Where they disagree, that disagreement is informative.

Six findings converge across two or more tracks:

### 1. Output format discipline is the highest-ROI single intervention

- **T1 evidence**: Aider's switch to unified-diff format took the same model from **20% → 61% pass rate** — a 3x reliability gain from output format alone, before any architectural change. The format signals to the LLM that a program will consume the output, suppressing lazy elision (`// add logic here`).
- **T3 alignment**: Asymmetrica's CodeMathEngine ELEGANCE_CHECK is itself output-format discipline — forcing the agent to emit Adequacy / Symmetry / Inevitability / Locality scores as plain text in a fixed shape. Same idea, different artifact.
- **Implication**: This is B11 territory. Highest known leverage move available to us.

### 2. Multi-turn is not a gap — it's a config choice we made

- **T2 finding (load-bearing)**: Pi has production-grade `SessionManager` with branching JSONL, compaction, resume. `--continue`, `--session <uuid>`, `--fork`, `inMemory()` all exist. The agent loop has retry/backoff, hooks, steering queues. **Shoshin's `dispatch.ts` deliberately passes `--no-session --print`**, which discards Pi's session machinery and forces the O(n) re-send-history pattern in `sarvam_interview.ts`.
- **Implication**: B10 is a config change in Shoshin, not new Pi code. The token-bloat workaround in B8 was infrastructure built around a non-problem.

### 3. Architect/Editor split fits Sarvam perfectly

- **T1 evidence**: Aider's o1-preview + o1-mini Architect/Editor combo hit ~85% on benchmarks at significantly lower per-token cost than o1-preview alone.
- **Sarvam-specific math** (T1): At 105 tok/s output × 2.35s TTFT, two sequential dispatches per task = ~10-15s total. **This is inside our existing per-dispatch budget.** Most engines can't run two sequential calls without UX pain at GPT-4 latencies; we can.
- **Implication**: B10 territory. Single biggest architectural win available to us at our engine's specific shape.

### 4. Validation gates are ready-to-lift, not ready-to-build

- **T1 evidence**: All high-performing systems embed a write-test-fix loop with explicit completion contracts. SWT-Bench (NeurIPS 2024) showed that requiring patches to make a failing self-generated test pass *doubled* code-agent precision.
- **T3 evidence (load-bearing)**: Asymmetrica already has `pkg/reasoning/gates.go` (`RunGates`, `ValidateNumeric`) — a 4-gate harness (Syntax + Semantic + Completeness + Warmth) **production-tested on live Ananta Telegram traffic**. Empirically calibrated thresholds (e.g. `ShouldAdmitUncertainty` was lowered from 0.70 → 0.40 on April 12 after a real chaos test). 300 LOC TS port, no I/O, pure functions.
- **Implication**: B12 territory. Build vs. lift answer is unambiguous: lift.

### 5. The "ask human" state must be first-class

- **T1 anti-evidence**: Devin's documented 70% production failure rate stems from no escalation path — agents pursue impossible tasks for days rather than surfacing blockers. Anthropic, Aider, Cline, Continue all keep humans in control at decision boundaries.
- **T3 alignment**: `HumilityPrefix` / `WrapWithHumility` (60 LOC port) maps confidence scores to honest language tiers (`>=0.90`: direct / `0.70-0.90`: "I believe" / `0.50-0.70`: "I think" / `<0.50`: "I'm not sure, but"). Already aligned with Shoshin's host role design (`name your handoff, never silently dispatch`).
- **Implication**: This is structural, not a feature flag. Shoshin's host already does it; the Builder needs the same discipline. B12 territory.

### 6. Codified project context (CLAUDE.md / .cursorrules pattern) is the canonical cross-session memory primitive

- **T1 evidence**: Cursor's `.cursorrules`, Claude Code's `CLAUDE.md`, Continue's `.continuerules` — different projects, same pattern. Low-tech, version-controlled, inspectable, survives model upgrades.
- **T3 evidence**: TOON format already integrated for memory bundles in `src/memory/toon.ts`, but Builder code-gen output is not yet TOON-encoded (extending integration is small work).
- **Implication**: B14 territory. Add SHOSHIN.md per-project file + extend TOON integration. Don't build vector DB, don't add STDB.

---

## Reliability Pillars × Shoshin's Current State

Pillars from T1 (industry-standard taxonomy), state assessed from T2 (engine layer) + B1-B8 commit history (Shoshin layer).

| Pillar | What "good" looks like | Shoshin today | Gap |
|---|---|---|---|
| **Plan-then-execute** | Architect describes solution naturally; Editor produces diff/code | Single-pass Builder; no separation | **B10** target |
| **Multi-turn execution** | Trajectory memory + project memory across sessions | Pi has it; Shoshin discards it via `--no-session` | **B10** target — config change |
| **Self-test loops** | Write code → run tests → repair, with hard stops | None; Builder produces output, advances feature, no execution gate | **B11/B12** target |
| **Repair loops** | Stop condition + error context injection + escalation path | None at Builder level; orchestrator just retries on failure | **B11** target — Axiom 9 |
| **Decomposition** | Vertical (feature) + horizontal (role) + contextual (file) | We have horizontal (7-role catalog from B5); vertical via features (B1); contextual via scopePath (B1) | Adequate ✓ |
| **Tool surface** | Read/Write/Edit/Bash minimum + git + LSP/lint + MCP | Pi provides all minimum + git via bash; LSP/MCP optional | Adequate for foundation ✓ |
| **Memory architecture** | Working + episodic + semantic (codified context file) + cross-session | Working ✓ (Pi sessions when wired), episodic ✓ (trail.jsonl), semantic ✗ | **B14** target — SHOSHIN.md |
| **Cost & latency** | Architect/Editor tier split + context reduction + hard stops | None — single-tier, no context reduction at dispatch, soft stops | **B10/B14** targets |
| **Observability** | Real-time inspectable state + reviewable artifacts | trail.jsonl + dispatch logs; no per-turn cost/latency telemetry | **B10** small fix |
| **Validation gates** | Compile + tests + reviewer agent | Evidence-text gates only (B1 Feature Done Contract); no execution-based gates | **B11/B12** targets |

**Status summary**: Foundation pillars (decomposition, tool surface, working/episodic memory) are solid. The reliability pillars (validation, repair, plan-execute, semantic memory) are systematic gaps. **The B10-B14 sequence below addresses each gap in dependency order.**

---

## Recommended Bundle Sequence (B10 → B14)

Each bundle is sized so it can ship in a single session, smokes-green, with a captured artifact. Dependencies are explicit.

### B10 — Pi Session Threading + Architect/Editor Split

**Goal**: Stop discarding Pi's multi-turn machinery; introduce Architect → Editor two-pass pattern for Builder dispatches.

**Source**: T2 (Pi already has it) + T1 (Aider/Sarvam-fit) — convergent.

**Concrete moves**:
1. Modify `src/orchestrator/dispatch.ts` to thread `--session <id>` instead of `--no-session`. Persist session ID per ticket in `.shoshin/sessions/<feature>.id`.
2. Parse session file path from `--mode json` header (T2: tiny Pi gap; if header doesn't include `sessionFile`, add it as XS Pi PR — see B10b below).
3. Refactor `sarvam_interview.ts` to use session-threaded dispatch — drop the O(n) re-send-history pattern. Each turn sends only the new user message.
4. Implement two-pass Builder: dispatch role `architect` first (plan in natural language, no code mutation), then role `builder` with the architect's plan in the brief.
5. Capture per-turn cost/latency in trail (extend Pi's `--mode json` to emit `session_summary` with `tokens`, `durationMs` — T2 gap, S size).

**Acceptance**:
- `udyam-ledger`-style demo runs through 3 features with Pi sessions; `~/.pi/agent/sessions/<encoded-cwd>/` shows the JSONL files.
- Token usage per dispatch drops measurably for multi-turn flows (interview, multi-cycle Builder).
- Architect+Editor combo produces compilable code on a fresh test fixture (proof-of-concept; full reliability claim comes in B11 with the gate).

**Risk**: Pi's `--session` + `--print` combination is documented but untested in our use case (T2 self-critique). If broken, we fix in Pi. If working, this is pure leverage.

**Estimated size**: M (one session of focused work).

### B11 — Output Format Discipline + Compile Gate

**Goal**: Make the Builder produce parseable diffs and reject "looks done but didn't compile" output before feature advance.

**Source**: T1 (Aider 20%→61%) + T3 (Axiom 9 spiral-exit, ELEGANCE_CHECK) — convergent.

**Concrete moves**:
1. Update Builder system prompt in `src/roles/catalog.ts` to require unified-diff or whole-file output (no prose code instructions). Format-mismatch responses get rejected by the orchestrator and re-prompted with format reminder.
2. Insert CodeMathEngine **Axioms 8, 9, 12 verbatim** into the Builder system prompt (T3 priority rank 2):
   - Axiom 8 (numerical trace before edit on test failures)
   - Axiom 9 (spiral-exit: same test fails twice → stop, trace, single targeted change)
   - Axiom 12 (tool-call optimality: >3 consecutive calls without plan → halt + write plan)
3. Add `compile_or_import_gate` to feature `WIRED → VERIFIED` transition: for Go projects `go build ./...`; for TS `tsc --noEmit`; for Python `python -c "import {package}"`. Free, instant, catches lazy elision.
4. Cap Builder repair loops at **5 iterations** (T1 recommendation for Sarvam-class engines at 5-15s/dispatch). Beyond 5: escalate to user via host role, not retry.

**Acceptance**:
- Builder responses on a synthetic test ticket are 100% parseable as diffs/files (no prose-code).
- Compile gate catches a deliberately-broken test ticket (one with elision); Builder is forced to fix on retry.
- Repair loop budget is enforced — synthetic stuck task escalates after 5 iterations rather than spinning.

**Risk**: Sarvam 105B's diff-format performance is open question (T1 Q2 — not yet measured for single-model Architect/Editor). If unified diff degrades quality for Sarvam, fall back to whole-file format with same compile gate.

**Estimated size**: M.

### B12 — Four-Gate Validation + Honest Confidence

**Goal**: Port Asymmetrica's production-tested response validation harness to TypeScript; couple gate scores to feature-state advancement.

**Source**: T3 (verbatim lift from `pkg/reasoning/gates.go`, ~300 LOC TS port) + T1 (validation gates pillar) — convergent.

**Concrete moves**:
1. Port `RunGates(intent, response, taskType)` and `ValidateNumeric(response)` from `ananta/asymm-intelligence/pkg/reasoning/gates.go` to `packages/shoshin-harness/src/gates/`. Replace Ananta-specific warmth vocabulary with coding-context completion signals (per T3 Q1: "tests pass", "build succeeds", "files changed: X", "review verdict: Y").
2. Wire `RunGates` as post-dispatch validation in `dispatch.ts`. Emits `ship` / `refine` / `restart` decision.
   - `ship` → return result, allow feature advance
   - `refine` → one retry with gate failure detail injected
   - `restart` → escalate to host role (do NOT retry blindly)
3. Port `HumilityPrefix` / `HumilitySuffix` / `WrapWithHumility` from `pkg/persona/humility.go` (T3 priority rank 4, ~60 LOC TS).
4. Couple confidence to feature state: gate score < 0.70 → feature cannot advance to VERIFIED without explicit human re-confirm. Builder admits uncertainty in its response prefix.

**Acceptance**:
- Smoke 015: deliberately-bad Builder output gets `restart` from gates and escalates to host with the failure detail.
- Confident output gets `ship` and advances cleanly.
- Confidence < 0.70 produces the prefix `"Based on my current understanding, ..."` in the Builder's response, surfaced to user.

**Risk**: Empirical thresholds calibrated for Ananta's Telegram chat traffic may not transfer cleanly to coding output. Plan: keep Ananta thresholds as initial values, add per-task-type override map, recalibrate after first 50 real Shoshin Builder runs.

**Estimated size**: M (port is straightforward; calibration is the unknown).

### B13 — Internal Eval Harness + DR-Regime Pre-LLM Gate

**Goal**: Build a small SWE-bench Pro-style eval against real Shoshin target code; add the DR-Regime pre-LLM gate so dispatch is regime-aware.

**Source**: T1 (build own eval, ~20-50 tasks; SWE-bench Verified scores >50% are memorization) + T3 (priority rank 3: pkg/vedic TS port, ~120 LOC).

**Concrete moves**:
1. Define a 20-task internal eval set: 5 each from {kirana-ledger-style CLI features, bhajan-app web features, multilingual prompt-handling tasks, refactor tasks}. Hand-graded gold patches.
2. Build `scripts/eval.mjs`: runs each task through `shoshin morning → run → evening`, compares output diffs to gold, emits pass-rate + breakdown by gate (compile / test / semantic / completeness).
3. Run baseline against B12 build. Number is our truth, not SWE-bench Verified.
4. Port `pkg/vedic` (DigitalRoot, DRToRegime, RegimeOfString, DRChain, DRAdd/DRMul) to `packages/shoshin-harness/src/vedic/`. ~120 LOC TS.
5. Wire `RegimeOfString(feature.title + feature.description)` into `runTicket` to annotate each ticket with R1/R2/R3. Bias dispatch:
   - R1 (Explore): more tools, larger token budget
   - R2 (Optimize): tighter scope, fewer retries
   - R3 (Stabilize): minimum viable dispatch, no exploration

**Acceptance**:
- Eval harness runs end-to-end, produces a single pass-rate number + per-gate breakdown.
- Baseline pass-rate measured (whatever it is — own truth).
- Regime annotation visible in trail; pulse log shows regime distribution per session.

**Risk**: Eval design is harder than it looks — choice of tasks determines what we optimize for. Start narrow (CLI features), expand after seeing first results.

**Estimated size**: L (eval design + execution + regime port).

### B14 — SHOSHIN.md Project Context + TOON Boundary Extension

**Goal**: Codified project memory + reduce token waste at dispatch boundary.

**Source**: T1 (CLAUDE.md / .cursorrules pattern is canonical) + T3 (TOON priority rank 5, extend existing integration).

**Concrete moves**:
1. Define `SHOSHIN.md` schema: project conventions, architectural decisions, naming patterns, stack-specific patterns, anti-patterns. One markdown file per project, version-controlled.
2. Host role reads SHOSHIN.md at session start (already part of memory hydration in B7, this just formalizes it as a first-class doc).
3. Builder/Architect read SHOSHIN.md at every dispatch. When Builder discovers a non-obvious convention (from spec, from feedback, from compile errors), it proposes a SHOSHIN.md update; user approves before write.
4. Extend TOON integration in `dispatch.ts`: encode `spec`, `brief`, `trail` fields with `toonEncode` before subagent prompt injection. Expected 20-30% dispatch context reduction (T3 measurement).
5. Generate SHOSHIN.md for `udyam-ledger` example as the canonical reference.

**Acceptance**:
- udyam-ledger has SHOSHIN.md; Builder dispatches reference it correctly.
- Token usage per dispatch drops 20-30% measurably (TOON savings).
- "Convention drift" incident on a synthetic ticket gets caught — Builder reads SHOSHIN.md, applies project pattern instead of inventing one.

**Risk**: SHOSHIN.md update flow can become a permission-fatigue UX (Cline's documented pain). Keep it lean: only proposes updates for non-obvious learnings, not every lint preference.

**Estimated size**: M.

---

## Deliberate Non-Goals (Saying No is Architecture)

These are explicitly out of scope for B10-B14. Each is opinionated and traces to source evidence.

| Non-goal | Why | Source |
|---|---|---|
| **Critic-model rescoring** (OpenHands pattern) | Doubles latency + cost; designed for batch SWE-bench eval, not interactive vibe-coder UX | T1 lesson 8 |
| **Fully autonomous multi-day execution** (Devin pattern) | 70% production failure rate without escalation; structurally wrong for our user | T1 lesson 5 |
| **STDB integration in Shoshin** | Operational overhead too high for dev harness; flat files + Pi sessions sufficient | T3 anti-rec |
| **Spinning Top v4 lift** (03_ENGINES) | Research-quality, no test suite, Go-toolchain-specific | T3 anti-rec |
| **Full asymm-mem AMCE pipeline** | Algebra-encode stage is heuristic; pipe quality depends entirely on it | T3 anti-rec |
| **S3 Vyapti engine** | Wrong domain (deal geometry, not coding) | T3 anti-rec |
| **RLM port to TypeScript** | Python-only, external library, no tests visible; architecture reference only | T3 anti-rec |
| **Vector embedding DB for semantic memory** | T1 finding: codified context files (CLAUDE.md pattern) outperform vector DBs in practice for cross-session memory | T1 pillar 7 |
| **Multi-agent complexity beyond 7-role catalog** | mini-SWE-agent at 100 LOC scores >74% Verified — complexity has diminishing returns | T1 mini-SWE-agent lesson |
| **Custom protocol over MCP for tool extension** | Pi already supports MCP; no need to fork | T2 Pi advantages |

---

## Open Questions (Validation Experiments)

Things the research couldn't resolve from text + code alone. Each is a small experiment to run in a B10+ bundle.

1. **Sarvam 105B's pass rate on a 5-iteration write-test-fix loop on coding tasks**. No published data. Run during B11 baseline.
2. **Architect/Editor split with single-model (Sarvam in both roles)**. Aider's gain was with different models. Run during B10 acceptance test.
3. **DEFAULT_MUTATION_ROOT in production sarvam-provider** (T2 Q5). Verify `toPiPlan()` sets `SARVAM_PI_MUTATION_ROOT` from `envelopeForRole` correctly. XS check, do during B10.
4. **Four-gate threshold calibration for coding context** (T3 Q1, Q5). Initial Ananta thresholds will likely need adjustment. Calibrate after first 50 Shoshin Builder runs in B12.
5. **Indic memory representation**. T1 Q3, T3 Q4. SHOSHIN.md format must support multilingual content cleanly. Resolve during B14.
6. **Unified-diff vs. whole-file format performance for Sarvam 105B**. T1 Q4. A/B during B11.
7. **`shouldForceSynthesis` threshold tuning for Builder** (T2 Q3). Current limits (read-only:2, mutation:4, RLM:8) tuned for short tasks. Evaluate during B11.

---

## Measurement Plan

How we'll know each pillar is actually ready. **Numbers, not vibes.**

| Pillar | Metric | Where measured | Target after B14 |
|---|---|---|---|
| Plan-then-execute | % of Builder dispatches that emit a plan before code | Trail records of `architect` dispatch preceding `builder` dispatch | >90% |
| Multi-turn | Avg tokens per dispatch in 6-turn interview | Pi `session_summary` telemetry | <40% of pre-B10 baseline |
| Self-test | % of features that pass compile-gate before VERIFIED | Feature transition events | 100% |
| Repair loops | Median repair iteration count when Builder hits an error | Trail records | <3 |
| Validation gates | False-positive rate of `ship` decisions on 20-task eval | B13 eval harness | <10% |
| Memory (semantic) | % of Builder dispatches that read SHOSHIN.md | Memory hydration log | 100% |
| Cost | Total tokens per feature cycle (3-feature udyam-ledger run) | Aggregate session_summary | <60% of pre-B10 baseline |
| Observability | % of trail records with cost+latency annotations | Trail schema | 100% |
| Honest uncertainty | % of <0.70-confidence Builder responses with humility prefix | Gate output sample | 100% |
| Eval pass-rate | 20-task internal eval pass rate | B13 eval harness | Track delta per bundle |

---

## Asymmetric Advantages We Should Exercise

T3 named six asymmetric advantages — capabilities a competitor would need 200+ days of cross-domain empirical work to replicate. The roadmap above exercises four of them:

1. **DR-Regime Fusion as O(1) pre-LLM gate** — exercised in B13 (regime annotation per ticket).
2. **Lean-proven primitive correctness** — referenced in B13 (DR gate inherits the proof).
3. **Four-gate quality harness with empirically-calibrated thresholds** — exercised in B12.
4. **CodeMathEngine spiral-exit rule** (Axiom 9) — exercised in B11.

Two we don't exercise yet (deliberately deferred):
- **Confidence-to-language mapping with tested thresholds** — partially exercised in B12 (HumilityPrefix port); Indian-English variants in `JoyfulIDontKnow` deferred.
- **Persona-pair dialectic** — already shipped in B5/B7; not exercised further in this roadmap, but available for future bundles.

---

## How This Roadmap Should Be Used

1. **For bundle sequencing**: B10 → B11 → B12 → B13 → B14, in this order. Dependencies are real (B11 builds on B10's session machinery; B13 calibrates B12's thresholds; B14 leverages B13's eval).
2. **For scope discipline**: when a future bundle proposes work, check it against the non-goals list. If it fits a non-goal, the proposer must produce new evidence overriding the source-doc reasoning.
3. **For measurement**: every bundle ships with at least one measurement plan entry green. No "feels better" claims allowed.
4. **For revision**: the roadmap is alive. As B10-B14 ship, learnings update this document. Treat the bundle order as a hypothesis, not a contract.

---

## What This Roadmap Doesn't Cover

Intentionally out of B10-B14 scope but worth naming:

- **Voice surface** (Sarvam Saaras v3 STT → host → Bulbul v3 TTS) — closes the loop for non-typing users like Sarat's mother. Bundle B15+.
- **Telegram/WhatsApp surface** — packages the host as a webhook for phone-first users. Bundle B15+ (parallel to voice).
- **Cross-session memory beyond SHOSHIN.md** — vector or quaternion-based semantic memory. Defer until SHOSHIN.md hits its limits in measured production use.
- **Wave-2 math primitives** (phi_ratio, vedic_mul, katapayadi, etc.) — extend the templates library. Independent track.
- **Cap'n Proto schemas** (Inversion #10 from B5 day) — structural hardening. Defer until B14 measurements show JSON serialization is a real cost.

---

🙏 Om Lokah Samastah Sukhino Bhavantu.

*This roadmap exists because Sarat asked for "a small research and planning pass to collect information ... and then work based off of that." Three subagents spent ~15 minutes of wall-clock between them producing ~9000 words of evidence. The synthesis above is opinionated; the source documents are evidence; the bundle sequence is hypothesis. Ship, measure, revise.*
