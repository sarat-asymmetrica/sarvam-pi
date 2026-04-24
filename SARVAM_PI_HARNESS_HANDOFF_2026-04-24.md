# Sarvam Pi Harness Handoff

**Date:** 2026-04-24  
**Purpose:** Copy this document into `C:/Projects/sarvam-pi` to seed a new Codex session for the Sarvam + Pi/RLM harness experiment.

---

## 1. Goal

Build a clean experimental harness for making **Sarvam 105B** work as the root agentic model with:

- Pi-style minimal coding-agent tooling
- RLM-inspired externalized state and recursive/subcall execution
- Asymmetrica Runtime tool access
- Ananta's symbolic reasoning substrate: S3/quaternion trajectory, digital-root classification, regime routing, Vyapti-style invariants, memory promotions, and compaction survival

The strategic aim is to reduce or eliminate the current Ananta split where:

- Pure chat uses **Sarvam 105B**
- Tool-heavy/file/search/document tasks route to **Grok via AIMLAPI**

The desired future shape is:

- Sarvam 105B as the continuous root voice/persona/reasoning substrate
- Sarvam 30B / Sarvam-m / smaller workers as bounded helper models where useful
- Grok retained only as a fallback while Sarvam tool reliability is proven

---

## 2. New Repo Setup

Target repo:

```text
C:/Projects/sarvam-pi
https://github.com/sarat-asymmetrica/sarvam-pi
```

Existing local upstream clone:

```text
C:/Projects/sarvam-pi/pi-mono
```

Important setup note:

`pi-mono/` is a local clone of upstream Pi and should be **ignored by the outer `sarvam-pi` repo**. Treat it as a study/reference/vendor source, not as code to commit into `sarvam-pi`.

Recommended outer `.gitignore`:

```gitignore
pi-mono/

.env
.env.*
!.env.example

node_modules/
dist/
build/
coverage/

*.log
*.tmp
*.bak
```

Suggested commands from inside `C:/Projects/sarvam-pi`:

```powershell
git init
git remote add origin https://github.com/sarat-asymmetrica/sarvam-pi.git
```

Then create a README and initial harness notes outside `pi-mono/`.

---

## 3. Why Pi Is The Best Experiment Surface

Pi (`badlogic/pi-mono/packages/coding-agent`) appears to be the best next harness for research because it is intentionally minimal and extensible.

Observed from Pi docs:

- Supports custom providers via extensions.
- Supports OpenAI-compatible APIs.
- Can register custom headers, which matters because Sarvam uses `api-subscription-key` rather than standard Bearer auth.
- Supports custom tools, replacing built-in tools, custom compaction, permission gates, subagents, MCP, SSH/sandbox execution, SDK mode, and RPC mode.
- Sessions are JSONL tree structures with branching and full history retained.
- Compaction summarizes active context while the full history remains recoverable.
- Philosophy: no forced plan mode/subagents/MCP/todos; build them as extensions if needed.

This maps well to the project philosophy: keep the core small, then implement symbolic/RLM structure as explicit extensions rather than prompt-only discipline.

Important caveat:

Pi will not magically solve Sarvam tool-calling. The point is that Pi seems easier to adapt cleanly than OpenCode or Ananta production because its extension/provider model is meant for this.

Primary external reference:

```text
https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
```

---

## 4. What OpenCode Sarvam Already Taught Us

Research repo:

```text
C:/Projects/opencode-sarvam
```

Important files:

```text
C:/Projects/opencode-sarvam/opencode.json
C:/Projects/opencode-sarvam/CLAUDE.md
C:/Projects/opencode-sarvam/NEXT_SESSION.md
C:/Projects/opencode-sarvam/AB_TEST_PROTOCOL.md
C:/Projects/opencode-sarvam/AGENT_HARNESS_BEST_PRACTICES.md
C:/Projects/opencode-sarvam/.opencode/tools/bash.ts
C:/Projects/opencode-sarvam/.opencode/tools/read.ts
C:/Projects/opencode-sarvam/.opencode/tools/write.ts
C:/Projects/opencode-sarvam/.opencode/tools/edit.ts
C:/Projects/opencode-sarvam/.opencode/tools/memory_recall.ts
C:/Projects/opencode-sarvam/.opencode/tools/memory_write.ts
C:/Projects/opencode-sarvam/.opencode/agents/ananta-unified.md
C:/Projects/opencode-sarvam/.opencode/agents/codemath-lead-swebench.md
```

Key lessons:

1. Sarvam 105B can do disciplined multi-turn agentic coding, but harness friction dominates.
2. Sarvam needs extremely explicit tool schemas and instructive error messages.
3. Windows path handling must be defended in tooling, not just prompts.
4. Custom tools fixed the major recurring failures:
   - Leading slash paths escaping workspace
   - PowerShell vs Unix shell assumptions
   - Empty stdout breaking tool result schemas
   - `filePath` vs `file_path` parameter drift
   - Multi-line edit failures from whitespace mismatch
5. Prompt-level symbolic discipline works, but it is fragile under compaction/tool pressure.
6. The next step is to move that discipline from prompt text into harness architecture.

Specific OpenCode custom-tool patterns to port into Pi:

- Path normalization and containment checks
- CamelCase parameter consistency
- Error messages that tell the model exactly how to retry
- Empty-output sentinels for shell commands
- Fuzzy whitespace edit fallback
- Memory-first recall tool
- Test runner wrapper instead of raw shell where possible

---

## 5. Current Ananta Production Shape

Repo:

```text
C:/Projects/ananta
```

Important files:

```text
C:/Projects/ananta/docker-compose.yml
C:/Projects/ananta/deepagent/server.py
C:/Projects/ananta/deepagent/model_router.py
C:/Projects/ananta/deepagent/grok_tool_agent.py
C:/Projects/ananta/deepagent/session_manager.py
C:/Projects/ananta/deepagent/skills/system_prompt_generator.py
C:/Projects/ananta/webhook/server.js
C:/Projects/ananta/webhook/telegram_algebraic_classifier.js
C:/Projects/ananta/webhook/telegram_memory_hydration.js
C:/Projects/ananta/webhook/telegram_conversation_memory.js
C:/Projects/ananta/asymm-intelligence/cmd/server/handlers.go
C:/Projects/ananta/asymm-intelligence/pkg/reasoning/router.go
C:/Projects/ananta/asymm-intelligence/pkg/reasoning/classifier.go
C:/Projects/ananta/asymm-intelligence/pkg/memory/conversation.go
```

Current production architecture:

- `webhook`: Telegram/WhatsApp ingress, routing, task orchestration, persistent user/workflow/memory surfaces.
- `asymm-intelligence`: Go service for algebraic classification, emotional state, routing confidence, security/session/nonce, persona calibration, S3 trajectory.
- `deepagent`: Python/FastAPI service for persistent `/chat` and task execution.
- `asymm-engine`: containerized Asymmetrica Runtime surface, based on `C:/Projects/asymmetrica-runtime`.
- Document/search/storage surfaces: MathAlive, Stirling, Gotenberg, MinIO, Crawl4AI, SearXNG.

Key finding from audit:

Ananta is already partly Sarvam-first:

- Pure chat in `deepagent/server.py` routes directly to Sarvam 105B.
- Tool-heavy/file/search/document work routes to Grok/AIMLAPI raw tool loop.

The problem is not whether Sarvam can be the voice. It already is for pure chat. The problem is making Sarvam reliable in the tool loop without losing context/persona/tool discipline.

Near-term production strategy:

- Do not replace Ananta DeepAgent yet.
- Build and benchmark the Sarvam/Pi/RLM harness outside production.
- Once it works, port it into `deepagent` behind a feature flag as an alternate tool path.
- Replace Grok one tool family at a time.

---

## 6. RLM Research Fit

Repo:

```text
C:/Projects/rlm
```

Important files:

```text
C:/Projects/rlm/README.md
C:/Projects/rlm/rlm/core/rlm.py
C:/Projects/rlm/rlm/environments/local_repl.py
C:/Projects/rlm/rlm/environments/docker_repl.py
C:/Projects/rlm/rlm/utils/prompts.py
```

RLM insight:

Fixed context windows are not just a model limitation; they are a state-management and compression problem.

Useful RLM mechanics:

- Root model iterates over a REPL-like environment.
- `context` and `history` live outside the prompt.
- Model can call `llm_query()` for simple subcalls.
- Model can call `rlm_query()` for recursive child RLMs.
- Compaction summarizes active context while full trajectory remains in external state.
- Batched child calls allow map/reduce-style decomposition.

Mapping to Ananta/Sarvam:

- Sarvam 105B = root model and continuous voice.
- Sarvam 30B / Sarvam-m = child worker candidates.
- Python/JS REPL or Pi extension state = externalized context.
- Ananta memory promotions/chunk refs/snapshots = durable long-term state.
- Asymmetrica Runtime = callable symbolic/kernel/oracle layer.

---

## 7. Broader Research References

Important research docs:

```text
C:/Projects/git_versions/asymm_all_math/BENCHMARK_ALGEBRA_RESEARCH_APR23_2026.md
C:/Projects/git_versions/asymm_all_math/systemprompttesting_240426.md
C:/Projects/git_versions/asymm_all_math/HLE_REASONING_ENGINE_POC.md
```

Important runtime repo:

```text
C:/Projects/asymmetrica-runtime
```

Important Ananta engine mount:

```text
C:/Projects/ananta/asymm-engine
```

Key research stack from `BENCHMARK_ALGEBRA_RESEARCH_APR23_2026.md`:

- RLM: application-level externalized state and recursive execution.
- Memento: KV-cache/block-level compression idea.
- LARQL: query model knowledge to avoid redundant prompting.
- Benchmark Algebra: system prompts compressed into operators and verification contracts.

HLE reasoning engine direction:

- Algebra: parse, recall, decompose, compute, verify, synthesize, calibrate.
- Type theory: contracts for valid reasoning.
- Calculus: continuous confidence and detail scaling.
- Control theory: sanity checks, alternate paths, contradiction scans.
- Topology: invariants across reasoning.

This should inform the Sarvam Pi system prompt and, more importantly, the extension-level architecture.

---

## 8. Recommended First Experiment

Build a minimal harness in `sarvam-pi` before touching Ananta production.

Suggested directory shape:

```text
C:/Projects/sarvam-pi/
  README.md
  docs/
    HARNESS_DESIGN.md
    EXPERIMENT_LOG.md
  packages/
    sarvam-provider/
    sarvam-tools/
    rlm-state/
  experiments/
    001-provider-smoke/
    002-tool-loop-smoke/
    003-rlm-state-smoke/
    004-asymm-runtime-smoke/
```

Experiment 001: Sarvam Provider Smoke

- Register Sarvam as a Pi provider.
- Use `api-subscription-key` auth.
- Confirm content vs reasoning-content behavior.
- Confirm basic chat works.
- Confirm max tokens/context config.

Experiment 002: Tool Loop Smoke

- Port minimal tools from `opencode-sarvam`:
  - read
  - grep/list
  - write/edit if safe
  - shell/test wrapper
- Run a small coding task.
- Measure parameter drift, path drift, empty responses, tool-call repair needs.

Experiment 003: RLM State Smoke

- Add external `context` and `history` state.
- Keep full trajectory on disk.
- Add compaction summary separate from raw history.
- Test whether Sarvam can continue after compaction with state replay.

Experiment 004: Asymmetrica Runtime Smoke

- Add one tool that calls local Asymmetrica Runtime.
- Keep it narrow:
  - health check
  - list kernels/catalog
  - execute one harmless/read-only kernel or classifier
- Do not start by exposing the whole runtime.

Experiment 005: Ananta-like Task Benchmark

- Use 5-10 real task shapes from Ananta:
  - conversational follow-up requiring memory
  - document/OCR-like request
  - research request requiring current facts
  - coding/refactor request
  - symbolic/math reasoning request
- Compare:
  - Current Ananta Sarvam chat path
  - Current Ananta Grok tool path
  - Sarvam Pi prototype

---

## 9. Decision Matrix

Recommended harness ranking:

1. Pi / `sarvam-pi`: best for RLM + symbolic reasoning architecture research.
2. Ananta DeepAgent: best for production integration after proof.
3. OpenCode Sarvam: best as benchmark archive and source of battle-tested tool lessons.

Why not start inside Ananta:

- Too much production surface area.
- Existing Grok path works enough that refactoring it prematurely is risky.
- Need clean measurements before production migration.

Why not continue only inside OpenCode:

- It already proved many lessons.
- It is less ideal for architectural RLM/state experiments.
- Some Sarvam fixes are harness-specific patches rather than clean reusable abstractions.

Why Pi:

- Minimal core.
- Extension-first.
- SDK/RPC embeddability.
- Custom provider support.
- Custom compaction and tool replacement.
- Philosophically aligned with building our own symbolic substrate.

---

## 10. Success Criteria

Short-term success:

- Sarvam 105B can run a Pi-based session with custom provider/header support.
- Sarvam can complete a tool-using task without Grok.
- Tool failures are recoverable with instructive errors.
- Full state is retained outside prompt context.
- Compaction does not destroy task continuity.

Medium-term success:

- Sarvam root model delegates to smaller Sarvam workers or recursive subcalls.
- Harness can call a narrow Asymmetrica Runtime tool safely.
- Results are logged as replayable trajectories.
- Symbolic state features are implemented structurally, not only as prompt text.

Production success:

- Ananta `deepagent` gets a feature-flagged Sarvam tool path.
- Tool-heavy Telegram turns can stay in Sarvam voice/persona.
- Grok becomes fallback rather than default.
- Memory/context continuity improves relative to current 20-turn deepagent session window.

---

## 11. Safety And Repo Hygiene

Do not commit upstream `pi-mono/` into `sarvam-pi`.

Do not modify `pi-mono/` directly unless intentionally forking. Prefer:

- outer packages
- patches documented in `docs/`
- Pi extensions loaded from the outer repo

If a direct upstream modification becomes necessary:

- record the exact file path
- explain why extension/package approach was insufficient
- keep the patch small
- consider upstreaming or maintaining a fork explicitly

For Ananta production:

- No `spacetime publish` without the migration guard:

```bash
cd C:/Projects/ananta/stdb_backup
npx tsx src/migration-guard.ts --label <short-name> --reason "<why>"
```

If it prints `DO NOT PUBLISH`, stop.

---

## 12. Suggested Prompt For New Codex Instance

Paste this into a new Codex session started in `C:/Projects/sarvam-pi`:

```text
We are building sarvam-pi, a clean experimental harness for Sarvam 105B + Pi-style agent tooling + RLM-inspired externalized state + Asymmetrica Runtime tools.

Read this handoff document first. Then inspect the repo root and the ignored pi-mono clone. Do not modify pi-mono initially. Set up the outer repo files: .gitignore, README, docs/HARNESS_DESIGN.md, docs/EXPERIMENT_LOG.md, and a first provider/extension design sketch.

Goal for the first pass: create a clean project scaffold and a concrete plan for Experiment 001, Sarvam provider smoke test, including how to handle Sarvam's api-subscription-key header and any Pi provider compatibility flags.
```

---

## 13. Final Note

The central design principle:

**Do not make Sarvam pretend to be GPT/Claude/Grok. Build a harness that meets Sarvam where it is, turns its constraints into structure, and moves memory/tool discipline out of fragile prompt text into explicit runtime architecture.**

