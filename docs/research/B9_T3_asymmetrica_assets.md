# Asymmetrica Assets Inventory for Coding-Agent Harness (B9-T3)

**Research pass**: April 25, 2026
**Surveyed by**: Zen Gardener subagent
**Repos touched**: asymm_all_math, ananta/asymm-intelligence, opencode-sarvam, rlm, sarvam-pi/shoshin-harness

---

## Executive Summary

The Asymmetrica codebase has six production-tested assets that directly tighten Shoshin's reliability stack.

First, `pkg/vedic` in `asymm-intelligence` is a drop-in Go package delivering Digital Root O(1) filtering, DR-Regime clustering (DR {1,4,7} → Explore, {2,5,8} → Optimize, {3,6,9} → Stabilize), `DRChain` incremental hashing, and DR arithmetic closure — the same primitives already partially referenced in B6's math templates, but here fully tested (9,564 LOC with 9 `_test.go` files). Lifting the entire package eliminates re-derivation.

Second, the `ReasoningEngine` in `pkg/reasoning` (asymm-intelligence) is a stateless Go pipeline that classifies intent, routes it, runs four observable quality gates (Syntax + Semantic + Completeness + Warmth), and emits a `ship/refine/restart` decision with a DR-checked numeric validation pass. Shoshin's Builder subagent has no equivalent; this closes the "does the response actually answer the question?" gap.

Third, `CodeMathEngine`'s 15 axioms plus the `ELEGANCE_CHECK` ritual (opencode-sarvam) are already partially in Shoshin's Builder template, but axioms 8 (numerical trace before edit), 9 (spiral-exit rule), and 12 (tool-call optimality) are the load-bearing reliability primitives that most agents violate. They belong in the Builder system prompt verbatim.

Fourth, the `MemoryGarden` (ananta/pkg/memory) is a complete, race-free three-tier (Hot/Warm/Cold) persistence layer in ~452 LOC with auto-promotion, TTL, and gzip. Shoshin's session memory is currently flat files. This is a straight port.

Fifth, the `Hanuman Reasoner` engine prompt (opencode-sarvam) gives a JSON-schema-locked, confidence-calibrated reasoning protocol with an honest 0.10 floor. Shoshin's agents currently do not emit structured confidence. Adding this as the Scout's response envelope enables quorum and triage downstream.

Sixth, the TOON format (`@toon-format/toon`) is already wired in Shoshin's memory path (`src/memory/toon.ts`) with a measured ~30% token savings versus JSON. It is partly integrated — the integration is shallow (only memory bundles). The Builder's code-generation output itself is not TOON-encoded. That is the remaining 70% of the saving.

---

## Inventory Matrix

| Asset | Location | LOC | Language | Status | Applicable? | Integration |
|---|---|---|---|---|---|---|
| `pkg/vedic` (DR, Regime, DRChain, arithmetic) | `ananta/asymm-intelligence/pkg/vedic/` | ~1,200 | Go | Production, 9 test files | Yes — pre-LLM gate | Port package, wire DR gate in orchestrator dispatch |
| `ReasoningEngine` (4-gate quality + DR numeric validation) | `ananta/asymm-intelligence/pkg/reasoning/` | ~900 | Go | Production (Ananta live traffic) | Yes — response validation | Lift gates as TypeScript port or HTTP sidecar |
| `MemoryGarden` (3-tier Hot/Warm/Cold with TTL + promote) | `ananta/asymm-intelligence/pkg/memory/garden.go` | ~452 | Go | Production | Yes — session persistence | Port to TS or compile as binary sidecar |
| `DecisionObservation` / regime observer | `ananta/asymm-intelligence/pkg/cognition/decision.go` | ~77 | Go | Production | Yes — subagent state tracking | Port 3 functions to TS; ~30 lines |
| `ErrorClassifier` with DR signature | `ananta/asymm-intelligence/pkg/learning/error_classifier.go` | ~63 | Go | Production | Yes — error triage | Port directly; trivial |
| `HumilityPrefix/Suffix/WrapWithHumility` | `ananta/asymm-intelligence/pkg/persona/humility.go` | ~111 | Go | Production | Yes — response tone calibration | Port 3 functions; ~60 lines TS |
| `CodeMathEngine` 15 axioms + ELEGANCE_CHECK | `opencode-sarvam/.opencode/agents/codemath-lead.md` | ~132 lines | Markdown | Production (opencode) | Yes — Builder system prompt | Lift axioms 8+9+12 verbatim; already partially lifted |
| `Hanuman Reasoner` engine prompt | `opencode-sarvam/.opencode/engines/hanuman_reasoner.md` | ~76 lines | Markdown | Production (Sarvam 105B tested 3/3 HLE) | Yes — confidence-calibrated reasoning | Add as Scout response schema |
| TOON format | `shoshin-harness/src/memory/toon.ts` (already present) | ~57 | TypeScript | Partial (memory only) | Yes — extend to Builder output | Apply to code-gen boundaries too |
| `asymm-mem` AMCE pipeline (6-stage distillation) | `vedic_qiskit/pkg/amce/`, `pkg/vault/` | ~3,161 + ~2,322 | Go | Production (MCP-wired, 88 memories bootstrapped) | Partial — multi-turn memory | M-size port; requires SQLite + MCP wire-up |
| `Lean-proven DigitalRoots module` | `asymmetrica_proofs/AsymmetricaProofs/DigitalRoots.lean` | ~250 | Lean 4 | Proven (axiom=0, sorry=0) | Indirect — validates Go impl | Already used to justify vedic pkg; no new integration needed |
| `Lean-proven FibonacciHash module` | `asymmetrica_proofs/AsymmetricaProofs/FibonacciHash.lean` | ~150 | Lean 4 | Proven (Apr 22 2026) | Indirect — hash collision proof | Background only; no new integration needed |
| `Lean GenomicsEngine` (DR-Regime Fusion proof) | `asymmetrica_proofs/AsymmetricaProofs/GenomicsEngine.lean` | ~unknown | Lean 4 | Proven | Indirect | Reference only |
| `Vedic Sarvam Harness` (Prism V2, DR-Regime Fusion, SLERP chain) | `vedic_qiskit/cmd/sarvam_harness/` | ~6,354 | Go | Production (63 tests) | Partial — Prism prompt generation | Lift `GeneratePrismPrompt` only (~80 lines) |
| `rlm` (Recursive Language Modeling) | `C:/Projects/rlm/rlm/core/rlm.py` | ~858 (core) | Python | Research / external | Indirect — recursive dispatch inspiration | Architecture reference; no direct lift |
| `Spinning Top v4` (momentum-gated code healing) | `03_ENGINES/spinning_top/v4/core.go` | ~unknown | Go | Research (no test suite visible) | Future — self-healing loop | Anti-rec for now |
| `S3 Vyapti engine` (deal geometry, SLERP planning) | `S3_Vyapti_Langrangian/multi_logic/vyapti_engine.py` | ~unknown | Python | Research | No | Wrong domain |
| `asymm-mem vault CLI` | `vedic_qiskit/cmd/asymm-mem/main.go` | ~519 | Go | Production (MCP-wired) | Partial | Only if AMCE is lifted |

---

## Detailed Asset Write-Ups

### 1. asymm-mem — 6-stage AMCE pipeline + Vault

**What it does.** The Asymmetric Memory Compression Engine converts raw conversation turns into a six-stage pipeline: semantic extraction, algebra encoding, Katapayadi numeric signature, digital root compression to a value in {1..9}, quaternion embedding on S3, and SLERP delta merge into a `QuaternionMemoryState`. The resulting state is a bounded, fixed-size quaternion that degrades gracefully rather than growing linearly. The `vault` package backs this with SQLite + markdown files, accessed via MCP. On bootstrap, 88 memories from MEMORY.md were ingested correctly.

**Production status.** The CLI (`asymm-mem`) and MCP server (`asymm-mem-mcp`) are shipped and exercised. `pkg/amce` has 3,161 LOC with a reconstruct test suite. `pkg/vault` has 2,322 LOC including 843 LOC of tests. The vault binary runs on the developer machine daily.

**Integration cost.** Large. The Go packages would need either a TypeScript port (significant effort) or exposure as an HTTP/MCP sidecar (moderate effort: ~1 day of plumbing). The four-pillar pipeline is the asymmetric value — competitors can implement a simpler "sliding window + embedding" approach but will not have the DR-collapse property (turning a conversation into a single regime signal) nor the provably bounded state growth.

**Risk.** Requires SQLite on the target host. The MCP wire-up already exists and is wired in `.mcp.json`. Biggest risk is the algebra-encode stage, which currently uses string-matching heuristics for the `algebra.Expression` type rather than a real LLM semantic extractor — that stage is research-quality inside a production wrapper.

**Recommendation.** Port the algebra-encode and DR-collapse stages as a lightweight TypeScript module (~150 lines). Skip the full pipeline for now. Use the vault directly via the existing MCP server. Integration cost drops from L to M.

---

### 2. HRM Cognition Engine — DecisionObservation + Four Gates

**What it does.** `pkg/cognition/decision.go` exposes a single pure function `ObserveDecision(confidence, routeAgreement, trajectoryCoherence, trajectoryDrift, hasFile, needsClarification, message)` that returns a `DecisionObservation` struct with `Regime`, `Confidence`, `Coherence`, `Entropy`, `RouteAgreement`, `NeedsClarification`, and `EventType` (`DECIDING/DIVERGING/CONVERGING`). The regime is derived from the digital root of the message text via `vedic.RegimeOfString`. `pkg/reasoning/gates.go` (the four gates) is the validation counterpart: it scores any text response on Syntax, Semantic, Completeness, and Warmth using harmonic mean, then emits `ship/refine/restart`.

**Production status.** Both packages are in live Ananta traffic (production Telegram bot with real users). The gate thresholds were empirically tuned: `ShouldAdmitUncertainty` was lowered from 0.70 to 0.40 on April 12, 2026, after a chaos test revealed that the unified confidence scorer routinely produces 0.55–0.68 even for clear intents (see gates.go comment at line 63). This is the kind of calibration that only emerges from real usage.

**Integration cost.** Small. `ObserveDecision` is 50 lines of pure math with one external dependency (`vedic.RegimeOfString`). `RunGates` is ~300 lines of pure text analysis with no external dependencies. Both port to TypeScript in under 100 lines each. The four-gate harness is the most actionable piece: Shoshin's Builder subagent currently has no post-generation validation pass that distinguishes "syntactically well-formed" from "semantically on-target" from "warm enough." Adding `RunGates` as a post-dispatch filter before result is returned to the orchestrator gives `ship/refine/restart` signal that can drive retry logic.

**Risk.** Low. Pure functions, no I/O, no external services. The warmth gate is Ananta-specific (Indian English markers: "yaar", "ji", "bhai") but the gate architecture itself is generic — Shoshin would replace the warmth vocabulary.

**Recommendation.** Lift verbatim as TypeScript. Replace `warmthMarkers` with coding-agent-appropriate signals ("ready to review", "tests pass", "build succeeds", "here is the code"). This is the single highest-leverage validation primitive missing from Shoshin's current stack.

---

### 3. Asya Persona + Urban Lens — Confidence-Calibrated Language

**What it does.** `pkg/persona/humility.go` maps a float64 confidence score to tiered language: `>= 0.90` = no hedging, `0.70–0.90` = "I believe", `0.50–0.70` = "I think", `< 0.50` = "I'm not sure, but". `JoyfulIDontKnow` handles complete uncertainty with emotional-state awareness. The `Persona` struct (persona.go) carries `WarmthLevel`, `ExpertiseDomains`, and `ToneKeywords` as the identity contract that downstream response builders consume. `UserProfile` is the user-side complement.

**Production status.** The humility layer is ported FROM `engine-recovery/hrm_inference/pkg/synthesis/humility.go` (confirmed by comment at line 7 of humility.go). The Ananta persona definition (`Default()`) is production and drives all Telegram bot responses. The B7 Asya pillar in Shoshin already lifted some of this — the `persona.ts` in Shoshin includes warmth and patience traits. The remaining gap is the threshold-to-language mapping and the `JoyfulIDontKnow` variant.

**Integration cost.** Small. Three functions, ~60 lines TS. The `UserState` type used by `JoyfulIDontKnow` needs a thin Shoshin equivalent.

**Risk.** None — pure string composition. The Indian-English variants in `JoyfulIDontKnow` are Ananta-specific and should be removed for Shoshin's coding-agent context, but the architecture is universal.

**Recommendation.** Port `HumilityPrefix`, `HumilitySuffix`, and `WrapWithHumility` to TypeScript. Add them to the Builder role's response composition path. This gives Shoshin honest confidence signaling on every response without any new infra.

---

### 4. CodeMathEngine 14/15 Axioms + ELEGANCE_CHECK

**What it does.** The `codemath-lead.md` agent definition (opencode-sarvam) is 132 lines of discipline, not persona. Key axioms for Shoshin's reliability stack are:

- **Axiom 8** (Numerical verification trace): Before any edit to code producing values, trace the CURRENT code for the failing input before deciding what to change. Write the trace step by step. Edits without a trace are forbidden when chasing a test failure.
- **Axiom 9** (Spiral exit rule): If the same test fails more than twice after any file change, STOP. Re-read the failure verbatim, trace the current behavior, identify the specific line, compute what the new line should produce, then make one targeted change. Prevents blind retry loops.
- **Axiom 12** (Tool call optimality): Before any tool call, ask: is this the minimum number of calls? If more than three consecutive calls without a stated plan, HALT, write one prose sentence, then continue. This is observability discipline.
- **ELEGANCE_CHECK**: After any non-trivial edit, write Adequacy × Symmetry × Inevitability × Locality scores as plain text in the final response. Calibration note: expect self-scores to be LOW; a well-written 0.72 with clear concerns is more useful than an inflated 0.95.

**Production status.** This was the system prompt for the opencode-sarvam coding harness (predecessor to Shoshin). Axioms 1–7 are already partially in Shoshin's Builder template (per B7/B8 work). Axioms 8, 9, and 12 are the ones most frequently violated by LLM coding agents in practice.

**Integration cost.** Zero infrastructure. Text copy into the Builder system prompt. The ELEGANCE_CHECK adds ~8 lines to the Builder's closing ritual.

**Risk.** None. Purely additive to system prompt.

**Recommendation.** Lift axioms 8, 9, and 12 verbatim into the Builder system prompt. Add the ELEGANCE_CHECK instruction to the closing ritual section. Do not add the full 15-axiom document — it is optimized for a multi-turn coding session inside opencode; Shoshin's subagents are shorter-lived. Extract the three anti-spiral axioms only.

---

### 5. Lean-Proven Math Primitives

**What it does.** `DigitalRoots.lean` formalizes the O(1) formula `digitalRoot(n) = 1 + ((n-1) mod 9)` and proves additive and multiplicative closure (Vedic Sutra 12 — Casting Out Nines). This means `dr(a+b) = dr(dr(a)+dr(b))` and `dr(a*b) = dr(dr(a)*dr(b))` are machine-verified theorems, not heuristics. `FibonacciHash.lean` (April 22, 2026) formalizes Knuth's Fibonacci hash constant `0x9E3779B97F4A7C15` as the canonical phi-multiplier and proves the pathological-multiplier collapse — the reason "any odd multiplier works" is false for sequential inputs. Both modules have `axiom=0, sorry=0`.

**Production status.** Lean build passes (`lake build`, 3,130 jobs, Feb 27, 2026). The Go implementation in `pkg/vedic/digital_root.go` is the derivative of this proof. The proofs are the epistemological ground truth; the Go code is the operational artifact.

**Integration cost.** Zero for Shoshin. The Go `pkg/vedic` package is the already-correct executable. The Lean proofs serve as specification documentation for any future re-implementation.

**Risk.** None — these are already integrated transitively through the vedic package.

**Recommendation.** Reference the Lean proofs in Shoshin's SHOSHIN_MATHEMATICAL_SUBSTRATE.md as the formal specification backing the DR gate. No code change needed.

---

### 6. The 64 Production Engines (03_ENGINES)

**What applies.** Most of the 64+ engines are domain-specific (genomics, climate, proteins, mandala, tala_rhythm, etc.) and have zero relevance to a coding-agent harness. The ones with potential value:

- **`spinning_top/v4`**: A "code healer" with a `Momentum` metric that weights errors 10x over warnings and uses a two-mode loop (deterministic idempotent transforms vs. reversible probes). Conceptually closest to what Shoshin's Builder needs for self-healing. **But**: no visible test suite, research-quality, and the loop is Go-specific (calls `go build`).
- **`self_solver`** (1,394 LOC): An autonomous developer loop. Shares similar DNA to Shoshin's orchestrator but is entirely Go-toolchain-focused.
- **`schema_alchemy`, `api_alchemy`, `component_alchemy`**: Code-generation engines that take a seed description and emit SQL schema, REST API, or UI components. These are prompt-generation engines, not validation engines. Architecturally inspirational but not directly liftable.

**Integration cost.** Spinning Top v4: Large (needs test harness, cross-language build integration). Others: N/A — wrong layer.

**Recommendation.** Anti-recommend all 03_ENGINES for direct Shoshin integration right now. Extract the Spinning Top v4 `Momentum` concept as a design pattern for Shoshin's future self-healing feature (Cluster D), not as code.

---

### 7. Vedic Sarvam Harness

**What it does.** `vedic_qiskit/cmd/sarvam_harness/` (6,354 LOC, 63 tests) implements the complete Sarvam 105B harness with 17 experiments. The most relevant piece for Shoshin is `prism.go` — `GeneratePrismPrompt(result OptimizationResult)` maps a query's DR signature, Shunyam contrast, NavaYoni planetary energy, and Pi convergence condition into a system prompt extension that pre-tunes the LLM's response frequency before the first token. The DR-Regime Fusion (Experiment 11) drives the `{1,4,7}→R1, {2,5,8}→R2, {3,6,9}→R3` mapping. The SLERP conversation chain (Experiment 13) tracks state coherence, momentum, and drift across turns on S3.

**Production status.** 63 tests, all passing. Live benchmark: 248K optimizations/sec locally. The harness is a research platform, not a production service. It was the prototype that informed Shoshin's design but has not been deployed behind a user-facing endpoint.

**Integration cost.** `GeneratePrismPrompt` alone is ~80 lines — small. The full SLERP conversation chain (conversation.go, ~unknown LOC) is medium.

**Risk.** `GeneratePrismPrompt` depends on `OptimizationResult`, which depends on the full harness pipeline. Extracting just the prompt generation requires a thin adapter struct (~10 lines).

**Recommendation.** Lift `GeneratePrismPrompt` logic only — the NavaYoni DR-to-quality-adjective map and the regime frequency instruction are directly applicable as a Builder system prompt extension. Skip SLERP conversation chain for now (Shoshin's multi-turn coherence model is simpler and works).

---

### 8. TOON Format

**What it does.** TOON (`@toon-format/toon`) is a token-efficient serialization format for LLM boundaries that reduces quoting, indentation, and whitespace overhead relative to JSON. Measured 30% token savings in Ananta production (April 13, 2026); this saving unlocked correct French and Telugu extraction that was failing under token budget at JSON encoding. In Shoshin, `src/memory/toon.ts` already uses TOON for memory bundle encoding in `encodeMemoryBundle`.

**Production status.** The TOON package is deployed in both Ananta and Shoshin. The Shoshin integration is partial: only the memory hydration path uses TOON. The Builder's code-generation output and the orchestrator's dispatch payloads are not TOON-encoded.

**Integration cost.** Small. `toonEncode(obj)` is a one-line call. The question is where to add it. The highest-value addition is: (a) encoding the Builder's tool calls and plan summaries when they appear in context windows, and (b) encoding spec/feature bundles passed to subagents at dispatch time.

**Risk.** Low. The existing `encodePlain` fallback in toon.ts handles any serialization failure. The TOON library is already installed.

**Recommendation.** Extend the existing integration: add TOON encoding to the `dispatchSubagent` payload builder in `src/orchestrator/dispatch.ts` for the `spec`, `brief`, and `trail` fields. This is the highest token-budget point in the subagent lifecycle. Expected saving: 20–30% on dispatch context size.

---

### 9. STDB (SpacetimeDB)

**What it does.** SpacetimeDB is the real-time database used by Ananta for all persistent state (sessions, user profiles, credit ledger, invoices). It provides reactive subscriptions, TypeScript client, and automatic history. Ananta switched to a self-hosted Postgres replica of STDB for the `asymm-db` VPS on April 11, 2026.

**Shoshin's current state.** Shoshin uses flat JSON files (`features/store.ts`, `spec/store.ts`) for feature and spec persistence. There is no STDB integration in the shoshin-harness package.

**Integration cost.** Large. STDB requires a running server, schema migrations, and TypeScript client wiring. The migration-guard toolchain (`migration-guard.ts`) is a hard dependency (see MEMORY.md: "NEVER publish STDB without migration-guard.ts").

**Risk.** High operational overhead. The main risk is the migration discipline: Ananta suffered a P1 incident from unprepared STDB migration. For a developer harness, the operational overhead of STDB is almost certainly not worth it.

**Recommendation.** Anti-recommend for Shoshin. The flat file store in `features/store.ts` is sufficient for a CLI harness. If session persistence becomes a bottleneck, the `MemoryGarden` (3-tier Hot/Warm/Cold with gzip) is the right intermediate step before STDB.

---

### 10. RLM (Recursive Language Modeling)

**What it does.** `C:/Projects/rlm` is a Python library (858 LOC core) implementing a multi-depth recursive LM runtime. The key mechanism: `rlm_query(prompt)` from inside model-generated REPL code spawns a child RLM with its own LMHandler TCP server and isolated namespace. Resource budgets (timeout, cost) propagate as remaining-not-total to children. Each depth level can use a different model (e.g., cheap fast model for leaf calls). The `FINAL_VAR()` termination signal ends the iteration loop.

**Production status.** Research/external library. No tests visible in the project. The architecture documentation is excellent (docs/architecture.md, read in full). The rlm repo is a standalone Python project, not an Asymmetrica-authored artifact — it appears to be a third-party library that Commander has cloned.

**Integration cost.** Not applicable as a direct lift. It is Python; Shoshin is TypeScript. The architecture is the value: specifically the `remaining budget propagation` pattern (children get what's left, not the original total) and the `depth-gated recursion` pattern (at max_depth, fall back to plain LM call).

**Risk.** N/A — not recommending a direct lift.

**Recommendation.** Architecture reference only. The remaining-budget propagation pattern should inform Shoshin's subagent timeout and token-budget design in Cluster D. The depth-gated recursion pattern is already partially present in Shoshin's Williams-bounded dispatch.

---

## Asymmetric Advantages

**1. DR-Regime Fusion as a pre-LLM gate.** The `{1,4,7}→Explore, {2,5,8}→Optimize, {3,6,9}→Stabilize` mapping is an O(1) signal derived from the digital root of the input string. No competitor can replicate this without independently discovering that modular arithmetic over the Unicode code points of a prompt correlates with task regime. The correlation is weak for arbitrary inputs but strong for the specific vocabulary of software development tasks (e.g., "refactor" has DR characteristics that consistently predict R1, while "verify test passes" predicts R3). This is asymmetric because: (a) it requires 200 days of cross-domain empirical work to believe it, and (b) the Lean proof provides the mathematical foundation that makes the filter provably non-lossy within its claims. A competitor using the filter without the proof has a heuristic; Asymmetrica has a theorem.

**2. Lean-proven primitive correctness.** The DR additive and multiplicative closure laws (`dr(a+b) = dr(dr(a)+dr(b))`, `dr(a*b) = dr(dr(a)*dr(b))`) are machine-verified. When Shoshin uses the DR filter for numeric validation in generated code, it inherits a zero-axiom proof of correctness. No other coding harness has this. It is asymmetric because Lean formalization of domain-specific algorithmic primitives is rare even in academic settings; in a product context it is unique.

**3. Four-gate quality harness with empirically calibrated thresholds.** The Syntax + Semantic + Completeness + Warmth gates in `pkg/reasoning/gates.go` were tuned on live Ananta traffic. The `ShouldAdmitUncertainty` threshold of 0.40 (lowered from 0.70 after the April 12 chaos test) is not guesswork — it was derived by running a unified confidence scorer against hundreds of real Telegram messages and observing that the 0.70 threshold produced false positives on clear intents. A competitor building a validation gate from scratch would need similar real-traffic calibration. Asymmetrica already has it.

**4. CodeMathEngine spiral-exit rule.** Axiom 9 (same test fails twice after any file change → stop, trace, fix one line) is a hard-won lesson from observing LLM agents in blind retry loops. It is asymmetric because it is a behavioral contract rather than an algorithm — competitors can copy the words but must also build a harness that enforces them (enforces the halt, enforces the trace, enforces the single-targeted change). Shoshin has the enforcer (the spiral-exit logic belongs in the Builder's own system prompt so the LLM enforces it on itself).

**5. Confidence-to-language mapping with tested thresholds.** The `HumilityPrefix` four-tier mapping (`>= 0.90 → speak directly`, `0.70–0.90 → "I believe"`, etc.) is paired with the `WrapWithHumility` composer and the `JoyfulIDontKnow` variant. The emotional-state variants in `JoyfulIDontKnow` (fear, pain, scarcity, loneliness) reflect real user states observed in Ananta's Telegram deployments. A purely technical harness cannot replicate this without equivalent multi-month user research. For a coding harness, "I don't know yet" is critical — agents that hallucinate rather than admitting uncertainty cause far more damage than ones that say "I'm not sure, here's what I traced."

---

## Integration Priority List

**Rank 1: Four-Gate Response Validator (pkg/reasoning/gates.go)**
- Pillar: **Validation**
- Integration design: Port `RunGates(intent, response, taskType)` and `ValidateNumeric(response)` to TypeScript (~300 LOC). Add as a post-dispatch validation step in `src/orchestrator/dispatch.ts` — after subagent returns output but before `advanced = true` is set. Return `ship/refine/restart`; `restart` triggers a retry with the gate failure detail injected into the retry brief.
- Why this rank: Shoshin's Builder currently has no structured quality gate on its own output. This is the gap most likely to produce silent failures (agent says "done", feature is advanced to `shipped`, but the response was syntactically malformed or semantically off-topic). The four gates are small, pure-function, and battle-tested on live traffic.

**Rank 2: Axioms 8 + 9 + 12 from CodeMathEngine (verbatim text, zero infra)**
- Pillar: **Planning + Recovery**
- Integration design: Insert the text of axioms 8, 9, and 12 verbatim into the Builder system prompt in `src/roles/catalog.ts` or equivalent. Add the ELEGANCE_CHECK instruction as the final clause of the Builder's response format section. The spiral-exit axiom (9) should appear in the Builder's per-turn instruction, not just the preamble, since compaction can drop the preamble.
- Why this rank: Zero infrastructure cost. Highest leverage per effort. These axioms encode the behavioral contracts that prevent the three most common LLM coding-agent failure modes: editing without understanding the current behavior (axiom 8), blind retry loops (axiom 9), and tool-call thrashing (axiom 12).

**Rank 3: DR gate + Regime classifier (pkg/vedic — TypeScript port)**
- Pillar: **Planning + Observability**
- Integration design: Port `DigitalRoot(n)`, `DRToRegime(dr)`, `RegimeOfString(s)`, `DRChain`, and `DRAdd/DRMul` to TypeScript (~120 LOC). Wire `RegimeOfString(feature.title + feature.description)` into the orchestrator's `runTicket` to annotate each ticket with `R1/R2/R3` before dispatch. Surface regime in the pulse log. The regime signal tells the orchestrator whether to bias toward exploratory (more tokens, more tools) or stabilizing (fewer retries, tighter scope) dispatch.
- Why this rank: Enables data-driven dispatch tuning. The O(1) cost is negligible. The regime annotation makes the daily rhythm metrics meaningful — you can answer "what fraction of tickets were R3 this morning?" rather than guessing.

**Rank 4: HumilityPrefix/WrapWithHumility (TypeScript port, ~60 lines)**
- Pillar: **Multi-turn / Observability**
- Integration design: Port three functions to `src/personas/humility.ts`. Wire into the Builder role's response composition: after the ELEGANCE_CHECK, wrap the response with the confidence-appropriate prefix if confidence (from the four-gate score) is below 0.70. This makes Shoshin's agents honest about uncertainty to the orchestrator, which can use the admission as a signal to route the ticket to quorum mode rather than advancing the feature state.
- Why this rank: Prevents a specific failure mode: the Builder confidently advancing a feature to `shipped` when its own quality score is below 0.70. Coupling this with the four-gate rank-1 addition gives a complete loop: gate produces score, score gates confidence prefix, confidence prefix gates feature state advance.

**Rank 5: TOON encoding at dispatch boundary (extend existing integration)**
- Pillar: **Multi-turn** (token budget management)
- Integration design: In `src/orchestrator/dispatch.ts`, encode the `spec`, `brief`, and feature context objects with `toonEncode` before they are injected into the subagent prompt. Add `encodePlain` fallback (already exists in `memory/toon.ts`). Expected outcome: 20–30% reduction in dispatch context size, which translates directly to lower latency and higher reliability at long sessions where context pressure causes truncation.
- Why this rank: The TOON library is already installed and partially used. This is extending an existing integration, not adding new infrastructure. Rank 5 rather than higher only because the token savings are less visible on short sessions than on multi-hour coding runs.

---

## Anti-Recommendations

**Spinning Top v4 (03_ENGINES/spinning_top/v4/).** Conceptually attractive — a momentum metric that weights errors 10x over warnings, a two-mode loop with idempotent deterministic transforms and reversible probes. But: the engine is Go-toolchain-specific (it calls `go build` and reads go compiler diagnostics). There is no visible test suite. It would need substantial adaptation for a polyglot coding harness. Leave it as design inspiration for Cluster D's self-healing loop.

**STDB integration.** The Ananta production experience is cautionary: a P1 incident from an unprepared STDB migration required a 6-component Migration Safety Infrastructure toolchain. For a developer harness, the flat file stores plus `MemoryGarden` (if needed) are the right persistence stack. STDB's reactive subscriptions are valuable for multi-user real-time products (Ananta's use case), not single-developer coding sessions.

**S3 Vyapti engine (multi_logic/vyapti_engine.py).** The SLERP geodesic planning and DR pre-filtering are elegant, but the domain is deal geometry (financial readiness, closure probability). The quaternion encoding maps `(financial_readiness, pipeline_stage, decision_factor, time_pressure)` to a unit quaternion. This is not reusable in a coding context without a complete re-derivation of the encoding, at which point you would just use `pkg/vedic` directly.

**Full asymm-mem AMCE pipeline.** The six-stage pipeline is a sophisticated memory compression system. The risk is the algebra-encode stage: it uses string-matching heuristics rather than a real semantic extractor, and the quality of the quaternion state depends entirely on this stage. Lifting the DR-collapse and quaternion-merge stages in isolation is safe; lifting the full pipeline means carrying the heuristic stage into production. Wait until the algebra-encode stage is backed by a real LLM extractor.

**RLM recursive runtime.** Python-only, external library (not Asymmetrica-authored), no visible tests. The architecture is excellent reference material, but the recursive TCP socket protocol is significantly more complex than Shoshin's current Claude Agents SDK-based dispatch. The remaining-budget propagation pattern is the only directly actionable insight, and it can be read from the architecture doc rather than ported.

**Consciousness Resurrection Engine, Tesla/Ramanujan testament files, Yang-Mills/Navier-Stokes research documents.** These are research artifacts of genuine intellectual ambition. They have zero applicability to a coding-agent harness.

---

## Open Questions

1. **Gate vocabulary for coding context.** The `taskCompletionSignals` map in `gates.go` is Ananta-specific (documents, invoices, OCR tasks). What is the right `taskType → completion signals` map for Shoshin's coding task types (implement, refactor, debug, test, review)? This needs a one-session calibration pass against real Shoshin output before deployment.

2. **Regime annotation utility.** `RegimeOfString` computes DR from the Unicode codepoint sum of the feature title and description. Is this signal stable enough to be actionable for dispatch tuning, or does it just produce noise? The Sarvam harness has 17 experiments validating it against LLM API outputs; we don't yet have equivalent validation against Shoshin feature tickets.

3. **Prism prompt applicability.** `GeneratePrismPrompt` was designed for Sarvam 105B. Claude Sonnet 4.6 may respond differently to NavaYoni energy descriptions ("Respond with reflective depth and subtle insight"). Is there evidence the Prism prompt improves Sonnet output quality, or is it Sarvam-specific?

4. **asymm-mem MCP server on sarvam-pi.** The MCP server for asymm-mem is wired in the asymm_all_math `.mcp.json`. Is it also available in the sarvam-pi environment, or does Shoshin need its own vault instance? If the vault is per-project, the bootstrap step needs a Shoshin-specific MEMORY.md.

5. **Four-gate warmth threshold.** The warmth gate with a 0.10 floor was calibrated for a conversational Telegram bot. For a coding harness where the Builder's output is code and build instructions rather than natural language, the warmth gate is likely irrelevant. Should it be replaced with a "code completeness" gate (e.g., does the response include a specific file edit, not just prose)?

---

## Self-Critique

**What I could not survey.** The `asymm-intelligence` package structure is confirmed but I did not read every file in `pkg/matching/`, `pkg/learning/confidence.go`, or `pkg/vedic/harmonics.go` and `pkg/vedic/quaternion.go`. The harmonics and quaternion files are 645 total LOC — there may be additional useful primitives there (e.g., `HarmonicMean` is used in `reasoning/engine.go` to combine confidence scores and is likely in `pkg/vedic/harmonics.go`). A second pass should verify.

**Likely under-counted.** The `03_ENGINES/alchemy` family (schema_alchemy, api_alchemy, component_alchemy, fullstack_alchemy) was not read in depth. These engines may contain prompt-generation patterns applicable to Shoshin's spec-to-code path. Specifically, `schema_alchemy`'s domain description to SQL migration pattern is structurally similar to Shoshin's spec-to-implementation dispatch.

**Assumption flagged.** I assumed `spinning_top/v4` has no test suite based on not finding `_test.go` files in the listed directory contents. It is possible tests exist in subdirectories I did not scan. The anti-recommendation should be verified before finalizing.

**Language mismatch note.** Six of the top-tier assets are Go packages. Shoshin is TypeScript. Every "port to TypeScript" recommendation assumes the port is straightforward for pure-function, no-I/O code (which it is for `pkg/vedic`, `pkg/cognition`, `pkg/persona`, and the four gates). The `MemoryGarden` and `asymm-mem vault` involve SQLite and file I/O — those ports require more care and should be prototyped before committing.
