# Reliable Agent Product Manifest

Living sprint spec for the post-proof phase. The goal is to turn the Sarvam + Pi harness from a successful experiment into a reliable coding agent for people who want simple, transparent, recoverable development.

Started: 2026-04-28 06:15 IST

## North Star

Build a coding agent that lets a user describe intent in ordinary language, watch the agent make bounded decisions, receive working artifacts, and understand failures without needing to become an agent engineer.

Reliability means:

- Simplicity: user-facing language should be plain and practical.
- Transparency: every important decision leaves a readable trace.
- Reliable decisions: gates decide when to trust, repair, stop, or ask.
- Recoverability: blocked runs explain what failed and what to do next.
- Native language readiness: the loop should preserve the user's words and language.

## Bundle Plan

| Bundle | Status | Theme | Target Outcome |
| --- | --- | --- | --- |
| 39 | Complete | Blocked-result diagnostics | Quality-blocked runs show last gate, repeated signature, changed files, and next action. |
| 40 | Complete | Feature report command | `shoshin report <feature>` summarizes status, sessions, gates, repairs, tokens, and artifacts. |
| 41 | Complete | Plain product language | Neutralize exposed internal framing into clean user-facing CLI/output copy. |
| 42 | Complete | Real task ladder | Define and add fixtures for progressively harder tasks from single-file SPA to existing-codebase modification. |
| 43 | Complete | HTML report / local dashboard seed | Generate a simple local run report with artifact links and gate timeline. |
| 44 | Planned | Human steering checkpoints | Add approve-plan, repair-manually-then-resume, and ambiguity pause hooks. |
| 45 | Planned | Multilingual task loop | Route multilingual user intent through the simplified loop while preserving free-text values verbatim. |

## Bundle 39 Spec

Problem: a quality-blocked run currently exits with raw response text and scattered trail events. The user can inspect the trail, but the immediate result does not explain the block clearly.

Implementation target:

- Add a structured quality-block summary to `RunTicketResult`.
- Summarize:
  - failed gate or blocker type
  - reason
  - scoped files changed
  - repair attempts spent
  - suggested next action
- Log the block into the trail as a first-class event.
- Print the block summary in `shoshin dispatch` when an advance was requested but not achieved.
- Add smoke coverage.

Acceptance:

- Existing repair/browser smokes remain green.
- A focused smoke verifies summary generation for browser, static HTML, mutation, compile, and final-answer blocks.
- Clean SPA dogfood still reaches `MODEL_DONE` or quality-blocks with readable diagnostics.

## Bundle Log

### 2026-04-28 06:15 IST

Created this manifest and started Bundle 39.

### 2026-04-28 06:20 IST

Bundle 39 complete. Added structured `quality_block` diagnostics to the run result, trail, and dispatch CLI. Covered gate summaries and exhausted dispatch failures with smoke 039. Dogfood passed cleanly after the change.

### 2026-04-28 06:35 IST

Bundle 40 complete. Added `shoshin report <feature>` with feature state, scope, sessions, token totals, repairs, gates, artifacts, tool-echo syntheses, and latest quality block. Smoke 040 covers report output from ordinary `.shoshin` files.

### 2026-04-28 06:42 IST

Bundle 41 complete. Updated public CLI/help/report language toward simple product terms: project brief, tasks, workers, activity log, blocked result, and final answer cleanups. Smoke 041 prevents internal terms from leaking into top-level help.

### 2026-04-28 06:48 IST

Bundle 42 complete. Added `docs/REAL_TASK_LADDER.md` plus the machine-readable `experiments/042-real-task-ladder/task-ladder.json` and smoke 042. The ladder now defines active rungs for single-file SPA, multi-action SPA, and scoped library implementation, with planned rungs through fullstack and refactor work.

### 2026-04-28 07:00 IST

Bundle 43 complete. Added `shoshin report <feature> --html`, writing `.shoshin/reports/<feature>.html` with state, metrics, gates, artifacts, and latest blocked result. Smoke 040 now covers terminal and HTML report output.
