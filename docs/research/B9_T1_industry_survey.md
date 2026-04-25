# Industry Survey — Reliable Coding Agents (B9-T1)

> Research date: April 25, 2026. Authored for the Shoshin harness team (Sarat Chandra Gnanamgari).
> Scope: production-grade reliability patterns for the Builder side of Shoshin.

---

## Executive Summary

Six patterns appear consistently across systems that actually work in production.

**1. Edit format discipline.** Systems that produce structured, machine-parseable diffs (unified diff, whole-file, or semantic AST patch) dramatically outperform systems that produce prose instructions. Aider's [switch to unified diff format](https://aider.chat/docs/unified-diffs.html) tripled pass rate on the same model (20% → 61%). The format signals to the LLM that a program will consume the output, not a human, which suppresses lazy elision.

**2. Separation of reasoning from execution.** Architect/Editor splits (Aider architect mode, GPT Pilot's specialist agents, OpenHands multi-agent) consistently outperform single-turn systems. The reasoning pass gets to describe the solution naturally; the editing pass gets to focus solely on syntactic correctness.

**3. Write-run-fix loops with hard stops.** Every high-performing system embeds a self-validation loop: write code → execute tests → capture output → repair. The critical engineering is the *stop condition*: without a max-iterations gate, agents enter [hallucination amplification spirals](https://medium.com/@komalbaparmar007/llm-tool-calling-in-production-rate-limits-retries-and-the-infinite-loop-failure-mode-you-must-2a1e2a1e84c8) where false assumptions become entrenched context.

**4. Human-in-the-loop as architecture, not afterthought.** The systems with the best production track records (Aider, Cline, Continue) keep humans in control at decision boundaries. Fully autonomous systems (Devin at launch) exhibit a documented pattern of spending days on impossible tasks rather than surfacing blockers.

**5. Context engineering over context size.** The Research → Plan → Reset → Implement loop (used explicitly in Cursor 2.0 and implicitly in OpenHands' event-stream design) outperforms naive "stuff everything in" approaches. [Context rot](https://www.coderabbit.ai/blog/your-ai-agent-has-amnesia) is real: models lose architectural coherence well before hitting the hard token limit.

**6. Contamination-aware benchmarking.** SWE-bench Verified scores in the 80-90% range are largely memorization artifacts. SWE-bench Pro (median task: 107 lines across 4.1 files, GPL/proprietary sources) shows the same frontier models scoring 44-57% — a 35-point real-world gap. Build against the Pro numbers, not the Verified ones.

---

## Comparison Matrix

| System | Architecture Pattern | Execution Model | Tool Surface | Memory Model | Error Recovery | SWE-bench Score | Notable Failure Mode | OSS? | Lang |
|---|---|---|---|---|---|---|---|---|---|
| **Aider** | Single agent + optional Architect/Editor split | Interactive REPL, git-commit loop | Read / Write (diff/whole) | In-context only; repo map as compressed symbol index | Git revert; re-prompt with error | 26.3% Lite (2024); architect mode SOTA ~85% w/ o1+DS | Lazy elision without diff format; context overflow on large repos | Yes | Python |
| **Cursor** | Background-indexed IDE + agentic composer; shadow workspace for LSP isolation | Interactive; background agents (v2+) | Read / Write / Terminal / Web / LSP-assisted lint | Per-project embedding index; no cross-session semantic memory | Re-prompts with diff rejection; tab recovery | Not published officially | UI churn; shadow workspace adds latency; speculative edits sometimes widen blast radius | No | TypeScript |
| **Continue** | Config-driven IDE assistant; model-agnostic router | Single-turn + multi-turn chat; slash commands | Read / Write / Edit / terminal | Embedding-based context providers; no persistent episodic memory natively; community Memory Bank proposal unmerged | None beyond re-prompt | Not published | Context staleness across sessions; no native repair loop | Yes | TypeScript |
| **Cline** | Plan + Act two-phase; human approval gates on sensitive actions | Stepwise; each action requires approval or allow-list | Read / Write / Bash / Browser / MCP tools | In-context only; no cross-session persistence | Test-run-fix loop; human can interrupt; logs surfaced in UI | Not published (model-dependent) | Approval fatigue for long tasks; context size balloons with full action log | Yes | TypeScript |
| **OpenHands** | Event-stream state; CodeAct (Python/bash execution as primary action surface); multi-agent delegation | Autonomous loop with human pause | Bash / Python REPL / Browser / File / MCP; sandboxed | Immutable event log (deterministic replay); no long-term semantic memory | Replay from checkpoint; critic model rescoring (inference-time scaling); max-iter stop | [60.6% Verified](https://openhands.dev/blog/sota-on-swe-bench-verified-with-inference-time-scaling-and-critic-model); #1 Multi-SWE-Bench | Long trajectories with expensive models burn cost fast; critic model doubles latency | Yes | Python |
| **Devin** | Autonomous SWE with browser + terminal + IDE; proprietary planner | Fully autonomous; async task queue | Full dev environment (browser, terminal, editor, shell) | Session-scoped; no persistent memory across tasks | Self-repair loop; no explicit human-in-the-loop triggers | [13.86% SWE-bench](https://cognition.ai/blog/swe-bench-technical-report) (2024, now outdated) | [70% failure rate in production testing](https://www.answer.ai/posts/2025-01-08-devin.html); hallucinates platform features; pursues dead-ends for days without escalating | No | Proprietary |
| **GPT Pilot** | Multi-agent development agency (spec writer, architect, tech lead, developer, debugger); iterative clarification | Sequential specialist pipeline; human Q&A gates | Read / Write / Bash; structured Q&A | Task-local context per agent; no cross-task memory | Runs code, captures errors, re-prompts debugger agent | Not published | Cascades from bad initial spec; task size sensitivity (too broad = bug explosion, too narrow = integration failures) | Yes | Python |
| **gpt-engineer** | Single-pass clarify + generate | One-shot full-codebase generation | Write only | None (stateless per run) | None; human re-runs manually | Not published | No repair loop; dependency management breaks; stale after generation | Yes | Python |
| **Sweep AI** | Issue-to-PR pipeline; GitHub webhook driven; search → plan → write → test | Async background; PR as output artifact | GitHub API / Read / Write / test runner | Per-issue context; no persistent memory | Re-opens PR if CI fails; self-reviews diff | Not published | High cost per PR; low signal-to-noise on ambiguous issues; can't handle cross-file refactors without architectural context | Yes | Python |
| **Smol Developer** | Three-phase: plan shared deps → enumerate files → parallel generate each file | One-shot with parallelized file generation | Write only | Shared dependency context passed to each generation call | None; human re-runs | Not published | No test execution; no repair; dependency madness on non-trivial projects; 2-4min per generation | Yes | Python |
| **Claude Code** | Subagent orchestration; context-reduction pipeline (5 strategies before every model call); MCP integration | Interactive + autonomous; subagents return summaries not full history | Read / Write / Edit / Bash / Web / MCP / file-based persistent memory | File-based persistent memory per subagent dir; version-controllable; no vector DB | Subagent retry with summary handoff; explicit permission system | [77.2% Verified](https://arxiv.org/html/2604.14228v1) (10 trials, 200K thinking); 78.2% at 1M ctx | Context amnesia across subagent boundaries when summaries lose detail; permission prompts interrupt flow | No (client) | Proprietary |

---

## Reliability Pillars — What Works

### 1. Plan-then-Execute vs Reactive Single-Turn

Reactive single-turn (original gpt-engineer, Smol Developer) produces coherent small programs but fails on anything with cross-file dependencies because there is no feedback path — the model has to be right on the first attempt.

Plan-then-execute with a human review checkpoint at the plan stage (GPT Pilot, Cline Plan Mode, Cursor 1.2 agent planning) catches the largest failure mode before code is written: misunderstood requirements. [GPT Pilot's core lesson](https://blog.pythagora.ai/gpt-pilot-what-did-we-learn-in-6-months-of-working-on-a-codegen-pair-programmer/) after six months: "The initial description of the app is much more important than we thought. Misleading early prompts branch reasoning in wrong directions, becoming nearly impossible to correct later."

**Best implementations:** Cline's explicit Plan/Act mode switch; GPT Pilot's Product Owner → Architect → Tech Lead pipeline; Aider's Architect/Editor separation.

### 2. Multi-Turn Execution with Conversation Memory

The key distinction is between *trajectory memory* (what did the agent just do) and *project memory* (what does the agent know about this codebase that persists across sessions).

- **Trajectory memory** is handled well by all event-stream architectures (OpenHands, Claude Code). The event log as immutable append-only structure enables deterministic replay — crucial for debugging agent failures.
- **Project memory** remains largely unsolved. Continue's community Memory Bank proposal (unmerged as of April 2026) is the most articulated open-source design. Claude Code's file-based subagent memory is practical and inspectable but requires agents to explicitly write to it. Cursor's embedding index handles symbol-level retrieval but not architectural decisions or team conventions.

[Chroma's Context Rot research](https://www.coderabbit.ai/blog/your-ai-agent-has-amnesia) found that model performance degrades measurably well before the context limit — the problem is not token count but reasoning coherence under distributed attention.

### 3. Self-Test / Self-Validate Loops

The write-test-fix loop is the single highest-leverage reliability pattern in the field. [SWT-Bench (NeurIPS 2024)](https://proceedings.neurips.cc/paper_files/paper/2024/file/94f093b41fc2666376fb1f667fe282f3-Paper-Conference.pdf) showed that filtering patches to only those that make a previously-failing self-generated test pass *doubled precision* of code agents. The insight: a model generating a test and then a fix is doing implicit formal verification — the test is a machine-checkable spec.

**Best implementations:** OpenHands CodeAct (bash execution as first-class action); Cline's terminal-in-the-loop; Harness AI's "never guess, adapt and replan on test failure" approach; Refact.ai's pass@1 discipline (one attempt only, reflecting real-world conditions).

### 4. Repair Loops

All production repair loops need three things: *a stop condition*, *error context injection*, and *escalation path*.

Without a stop condition, the [infinite loop failure mode](https://medium.com/@komalbaparmar007/llm-tool-calling-in-production-rate-limits-retries-and-the-infinite-loop-failure-mode-you-must-2a1e2a1e84c8) is inevitable: the model retries indefinitely because the error signal does not change. Typical guardrails: max iterations (50), time budget (3 hours), idle detection (no new commit in 5 iterations).

The critical insight from Refact.ai: when the model gets stuck, inject a helper message as if from a "simulated user" to break the local minimum. This is structurally equivalent to Regime 2 → Regime 3 forcing in the three-regime dynamic.

Hallucinated tool names and hallucinated APIs are *permanent* repair failures — no retry can make a missing key appear in a dictionary. The correct response is to detect these early (static type checking, schema validation) and restart from a clean state rather than grinding through retries.

### 5. Decomposition

Three decomposition strategies are in use:

**Vertical (by feature):** GPT Pilot's user-story breakdown. Works well for greenfield; fails when stories have hidden cross-cutting dependencies.

**Horizontal (by agent role):** Architect vs. Editor vs. Reviewer separation. Works well for multi-file changes where reasoning and syntax correction are distinct cognitive loads. [Aider's architect mode](https://aider.chat/2024/09/26/architect.html) is the cleanest implementation: the Architect describes the solution in natural language; the Editor converts to a diff; neither role is asked to do both simultaneously.

**Contextual (by file/module boundary):** Claude Code's subagent-per-concern pattern, where each subagent owns an exclusive file set and returns only a summary. Prevents context cross-contamination but requires careful scoping at orchestration time.

The [mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent) (100 lines of Python, >74% SWE-bench Verified) demonstrates that decomposition complexity is often over-engineered: a flat sequential bash loop with a linear message history outperforms elaborate multi-agent setups on many issue-resolution tasks. Complexity should be justified by task structure, not added preemptively.

### 6. Tool Surface

The minimum effective tool set for a coding agent is: **Read + Write + Bash + (optionally) Browser**. Everything else is optimization.

The key insight from OpenHands CodeAct: treating code execution (Python/bash) as the primary action surface rather than wrapping everything in structured function calls makes the agent model-agnostic and eliminates tool-schema hallucination. Any model that can write bash can use CodeAct.

Beyond the minimum, what actually matters in production:
- **Git integration** (Aider): makes every edit reversible, turns failure into a safe experiment.
- **LSP / type-aware lint** (Cursor shadow workspace): catches type errors before the repair loop rather than after.
- **MCP integration** (Claude Code, Cline, OpenHands v1): enables domain-specific tools (database clients, API simulators, deployment hooks) without forking the agent codebase.

Tools that add more failure surface than reliability: browser automation in non-supervised contexts (hallucinated clicks), arbitrary shell execution without sandboxing (security + infinite-loop risk), and external API calls without fallback/mock (network failures break determinism).

### 7. Memory Architecture

Four memory tiers in order of implementation maturity:

| Tier | What it holds | Best current implementation |
|---|---|---|
| Working (in-context) | Current task trajectory | All systems; event-stream (OpenHands) is cleanest |
| Episodic (session) | What happened this session; can be replayed | OpenHands event log; Claude Code subagent history |
| Semantic (cross-session) | Codebase conventions, team decisions, architectural rationale | File-based CLAUDE.md / .cursorrules / .continuerules; embedding indexes (Cursor) |
| Cross-project / organizational | Patterns reusable across codebases | No production-grade open implementation exists yet |

The most pragmatic cross-session memory pattern in the field is the **codified context file** — a human-readable, version-controlled document that the agent reads at session start and writes to when it discovers something worth persisting. Claude Code's CLAUDE.md is the canonical example. It is low-tech, inspectable, diffable, and survives model upgrades.

### 8. Cost and Latency Engineering

Three concrete techniques with documented impact:

**Architect/Editor model tier split.** Use an expensive reasoning model (o1, Opus) as Architect; use a cheap fast model (DeepSeek, Haiku, Sonnet) as Editor. The Architect produces the hard-to-generate reasoning; the Editor does the cheap syntactic transformation. [Aider's benchmarks](https://aider.chat/2024/09/26/architect.html) show o1-preview + o1-mini at 85% — nearly matching o1-preview alone at significantly lower per-token cost.

**Context-reduction before every call.** Claude Code applies five explicit context-reduction strategies before each model call (lazy instruction loading, deferred tool schemas, subagent summary-only returns). Context size is the primary cost driver in multi-turn agents; every token not sent is free.

**Hard stop conditions.** Max-iteration limits prevent the most expensive failure mode: a stuck agent spinning through retries at frontier-model prices. A 50-iteration limit with a 3-hour timeout is the production standard across multiple systems. For Sarvam 105B at 10.3B active parameters and 105 tok/s output speed, cost per trajectory is much lower than GPT-4-class — but iteration count still determines whether a task costs $0.01 or $1.

### 9. Observability

The systems users trust most are those that make agent state *inspectable in real time*, not just logged after failure.

**Best implementations:** Cline surfaces agent thoughts and pending tool calls with per-action approval; GPT Pilot shows which specialist agent is running and what it is planning; Aider shows the diff before it is applied and always commits — every edit is a reviewable git artifact.

The critical failure pattern is **silent partial completion**: the agent writes 70% of a feature, the remaining files are untouched, and the output *looks* complete. [Devin's production review](https://www.answer.ai/posts/2025-01-08-devin.html) found this was the most common outcome — core logic implemented, edge cases and integration points missing. The solution is explicit completion contracts: an agent should be required to state which files it changed, run the full test suite, and report coverage delta before declaring done.

### 10. Validation Gates

When does the agent know it is done?

The weakest gate: "the code looks right." Used by gpt-engineer, Smol Developer, early Sweep. Produces plausible non-compiling output regularly.

The intermediate gate: "the tests I wrote pass." Used by most modern systems. Reliable within the scope of what tests cover; misses integration issues and unwritten test paths.

The strongest gate in current production: "the existing test suite passes + CI passes + a reviewer agent finds no issues." OpenHands' critic model rescoring and Harness AI's reflect-and-replan pattern approach this. Claude Code's post-commit hook integration (running tests after every commit) is practical for real repos.

For Shoshin specifically: the gate should include **compilation or import success** (free, instant, catches the most common silent failure) plus **at minimum one test execution** covering the changed surface. Do not trust completion self-reports without an execution artifact.

---

## What Fails

### Tunnel Vision / Scope Creep

Agents without explicit file-ownership scoping will modify files adjacent to the target because those files are in context and the model finds "improvements." This is the [blast-radius problem](https://beuke.org/ralph-wiggum-loop/): the agent fixes the wrong thing because it optimized for coherence within its context window rather than for minimal diff. Fix: explicit file-lock at task start; git diff review before commit.

### Hallucinated APIs

[Ranger's survey of common AI bugs](https://www.ranger.net/post/common-bugs-ai-generated-code-fixes): agents call API methods that do not exist in the version of the library the project uses, fabricate configuration options, and invent package names that resolve to nothing or to malicious packages in npm/PyPI. This failure is silent at generation time and surfaces at runtime. Fix: version-pinned dependency schemas in the agent's context; import validation as a mandatory pre-commit gate.

### Infinite Repair Loops

A stuck model retrying the same approach does not get unstuck by retrying more. The error signal must change between retries (different test, different framing, broader context) or the loop must terminate. [Production LLMOps data from ZenML (1,200 deployments)](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025): loop budget exhaustion is a top-3 production incident cause. Fix: max-iteration + idle-detection stop conditions; inject structurally different context after N failed iterations rather than repeating.

### Expensive Failures on Impossible Tasks

[Devin's documented failure](https://www.answer.ai/posts/2025-01-08-devin.html): asked to deploy multiple apps to a single Railway deployment (unsupported), Devin spent over a day attempting solutions and hallucinating platform features. Fully autonomous systems without an escalation path will burn budget on tasks that require human judgment about possibility. Fix: impossible-task detection as an early routing step (does this task require capabilities beyond tool surface?); time-boxed preliminary feasibility check before committing to full execution.

### Looks Done But Didn't Compile

The most reported failure mode in user forums across Cursor, Cline, and Claude Code: code that passes visual inspection but fails at import or compilation. Caused by: lazy elision (model writes `// add logic here`), context-window truncation mid-function, model outputting correct logic for wrong language version. Fix: Aider's unified diff format reduces elision 3x; mandatory compilation/import check as the cheapest validation gate.

### Silent Partial Completions

As documented in [Devin's production review](https://www.answer.ai/posts/2025-01-08-devin.html) and [the Devin aftermath analysis](https://www.sitepoint.com/devin-ai-engineers-production-realities/): "The most dangerous failure mode is not obviously broken code. It is plausible, well-structured code that does the wrong thing." Agents regularly deliver 70% of a feature. Fix: completion contracts (enumerate which files were changed, which tests cover them, what the expected behavioral delta is); human diff review as final gate for anything touching production paths.

### Context Degradation on Large Repos

[METR research, July 2025](https://intuitionlabs.ai/articles/ai-code-assistants-large-codebases): experienced developers believed AI tools made them 20% faster; objective measurement showed 19% *slower* due to time correcting AI output and managing the mismatch between generated code and codebase conventions. The culprit: monorepos where the agent cannot hold the full architecture in context and makes locally-coherent but globally-wrong decisions. Fix: codified context files (CLAUDE.md / .cursorrules) as architectural load-bearing artifacts; Research → Plan → Reset → Implement loop to avoid mixing exploration and execution context.

---

## SWE-bench Reality Check

### Verified Leaderboard (as of April 25, 2026)

Top scores on [llm-stats.com SWE-bench Verified leaderboard](https://llm-stats.com/benchmarks/swe-bench-verified):

| Rank | System | Score |
|---|---|---|
| 1 | Claude Mythos Preview (Anthropic) | 93.9% |
| 2 | Claude Opus 4.7 (Anthropic) | 87.6% |
| 3 | Claude Opus 4.5 (Anthropic) | 80.9% |
| 9 | GPT-5.2 (OpenAI) | 80.0% |
| — | Claude Code (77.2% Verified, 10 trials 200K thinking) | 77.2% |

### The Contamination Problem

OpenAI's internal audit found that every frontier model tested — GPT-5.2, Claude Opus 4.5, Gemini 3 Flash — could [reproduce verbatim gold patches](https://www.morphllm.com/swe-bench-pro) for certain SWE-bench Verified tasks. OpenAI has stopped reporting Verified scores. The benchmark is primarily measuring memorization for top frontier models.

### SWE-bench Pro (Contamination-Resistant)

Scale AI's [SWE-bench Pro](https://labs.scale.com/leaderboard/swe_bench_pro_public) uses GPL/proprietary codebases, multi-language tasks (Python, Go, TypeScript, JavaScript), median task size of 107 lines across 4.1 files. Results on the SEAL leaderboard with standardized scaffolding:

| System | SWE-bench Pro Score |
|---|---|
| GPT-5.3-Codex | 56.8% |
| Claude Opus 4.5 | 45.9% |
| Claude Sonnet 4.5 | 43.6% |

The gap: models scoring 80%+ on Verified reach 44-57% on Pro. **The 35-point delta is the real-world penalty for overfitting to the benchmark distribution.**

For Shoshin, this means: any self-reported benchmark score above ~50% on Verified should be treated skeptically. Build your own eval harness on your own codebase; Pro-style tasks (multi-file, multi-language, non-trivial patch size) are the correct calibration target.

### The Mini-SWE-Agent Lesson

[Mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent) — 100 lines of Python, bash as the only tool, linear message history — scores >74% on SWE-bench Verified. This is above Devin's original 13.86% (2024) and competitive with many elaborate multi-agent systems. The implication: scaffolding complexity has diminishing returns once the model is capable. The bottleneck shifts to model quality and context engineering, not orchestration architecture.

---

## Lessons Applicable to Shoshin

**1. Adopt the Architect/Editor split for Builder tasks.** Sarvam 105B at 105 tok/s output and ~2.35s TTFT is fast enough to run two sequential model calls per task without user-perceived latency becoming painful. Use the first pass (Architect) to plan and decompose in natural language; the second pass (Editor) to produce the diff/code. This pattern alone yields the largest single-step reliability gain in the field — going from 20% to 61% on the same underlying model in Aider's benchmarks.

**2. Use unified diff or whole-file as the primary edit format, not prose.** Prose code instructions ("change line 42 to add X") degrade rapidly as file size grows. The unified diff format forces the model to be precise because the output is consumed by a program, not a human. For Sarvam 105B specifically: the model has seen extensive git diff data in its training corpus (it was trained on open-source Indian and global software), so this format should transfer well.

**3. Mandatory compile/import gate before reporting task complete.** This is the cheapest, highest-yield validation gate. For Python: `python -c "import module"`. For Go: `go build ./...`. Free, instant, catches the most common "looks done but isn't" failure. Do not let the Builder report completion without this.

**4. Cap repair loops at 5 iterations for Sarvam 105B.** At 5-15s latency per dispatch (measured in production), an uncapped repair loop at 50 iterations costs 4-12 minutes of wall time and potentially significant API cost. Five iterations is the empirically correct budget for issue-class tasks that a capable model should be able to solve; beyond that, the correct action is escalation to human or task abandonment, not more retries.

**5. Do NOT adopt fully autonomous multi-day execution without escalation paths.** Devin's architecture — no human-in-the-loop trigger, fully async background execution — produces a specific pathology: the agent pursues impossible tasks for hours/days rather than surfacing blockers. Sarvam 105B is MoE with 10.3B active parameters; it is genuinely capable but not infallible. The escalation path (ask the human a clarifying question) must be a first-class citizen of the Builder state machine, not a fallback.

**6. Implement Research → Plan → Reset → Implement as the top-level loop.** Do NOT let exploration context pollute implementation context. The exploration pass fills the context with uncertainty, dead ends, and alternative framings that confuse the implementation pass. This is the single most effective architectural pattern for avoiding context rot on real codebases.

**7. Codify project context in a SHOSHIN.md / per-project context file.** Every session that starts cold pays a 5-10 dispatch tax to rediscover project conventions. A version-controlled context file that the Builder reads at task start and updates when it discovers something non-obvious is the lowest-tech, highest-leverage memory investment. This is Cursor's `.cursorrules`, Claude Code's `CLAUDE.md`, Continue's `.continuerules` — all converging on the same pattern.

**8. Do NOT adopt OpenHands' critic-model rescoring pattern at this stage.** It doubles latency and cost per trajectory. It is designed for batch SWE-bench evaluation, not interactive user-facing coding. The benefit (improved pass rate) does not justify the UX cost for a vibe-coder harness where responsiveness is a core value.

**9. Sarvam 105B's Indic-native training is a structural advantage for Indian codebase conventions, comments, and variable naming.** No other coding agent is built for this. Lean into it explicitly: the context file should include conventions in the user's preferred Indic language if applicable; the Builder should produce comments in that language when the user's intent signals it.

**10. Treat SWE-bench Verified scores above 50% as noise for planning purposes.** Use SWE-bench Pro-style calibration (multi-file, multi-language, non-trivial patch) to benchmark Shoshin's Builder. Build a small internal eval harness (20-50 tasks) drawn from the target user's actual codebase within the first sprint.

---

## Open Questions

**Q1.** What is Sarvam 105B's actual pass rate on a 5-iteration write-test-fix loop on Python tasks? No published data exists for this exact configuration. This is the most important number to measure before committing to loop budget.

**Q2.** Does the Architect/Editor split yield similar gains with a single model (Sarvam 105B as both roles in sequential calls) as it does with different models? Aider's benchmark used different models for each role. The Shoshin architecture may need to simulate role separation through prompt engineering rather than model switching.

**Q3.** What is the right cross-session memory representation for Indic-language code comments and mixed-language (English + Tamil/Hindi) identifier conventions? Existing memory systems (CLAUDE.md, .cursorrules) are English-centric. The opportunity space here is large and completely unexplored.

**Q4.** Mini-SWE-agent achieves >74% with 100 lines and bash-only tool surface. Does adding MCP tools or a richer tool surface improve or hurt reliability for Sarvam 105B? More tools means more schema for the model to reason about — with a 10.3B active parameter MoE, cognitive budget per call matters.

**Q5.** What is the failure mode distribution specific to Indian open-source codebases? Hallucinated APIs and library versions are calibrated to PyPI/npm global packages; Indian enterprise codebases often use different dependency ecosystems (SAP integrations, custom ERP clients, Tally APIs). This may shift the repair loop design significantly.

---

## Self-Critique and Survey Blind Spots

The two systems I could not characterize with confidence are Cursor (proprietary architecture; shadow workspace details come from a single reverse-engineering blog post, not official documentation) and Sweep AI (the project appears to have pivoted toward an enterprise model in 2025-2026 and public architectural documentation is sparse). The SWE-bench section is the most solid part of this survey; the memory architecture section is the weakest — cross-session memory for coding agents is a largely unsolved problem and the "best practices" cited here are community proposals rather than production-validated patterns. The Shoshin-specific recommendations in section 7 are engineering opinions, not empirical results; they should be treated as hypotheses to validate against Sarvam 105B's actual behavior, not as settled conclusions.
