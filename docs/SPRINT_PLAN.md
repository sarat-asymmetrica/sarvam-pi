# Autonomous Sprint Plan

## Goal

Turn `sarvam-pi` from a provider smoke into a repeatable Sarvam 105B coding-agent and general-intelligence harness.

The first sprint keeps Sarvam 105B as the root model and as the model for all planned subagent roles. Smaller Sarvam workers can be introduced later after the root harness and state architecture are stable.

## Milestones

### 0. Baseline

Freeze the working state:

- Pi loads the outer `sarvam-provider` extension.
- Sarvam authenticates through `api-subscription-key`.
- Sarvam can answer plain text prompts.
- Sarvam can read `README.md` through Pi's tool loop and synthesize an answer.

Commit target: `Scaffold Sarvam Pi harness and provider smoke`

### 1. Tooling Foundation

Harden the provider/tool bridge:

- preserve exact Sarvam auth behavior
- support native OpenAI-style `tool_calls`
- support Sarvam XML-ish `<tool_call>` fallback
- normalize common argument aliases such as `file_path` and `filePath`
- expose clear errors for blank or malformed responses
- document the tool protocol

Commit target: `Harden Sarvam provider tool-call bridge`

### 2. Safe Mutation Smoke

Add a bounded mutation experiment before enabling real coding tasks:

- create a disposable fixture
- test read, edit/write, and verification there only
- document path containment and Windows path recovery needs
- keep `pi-mono/` read-only

Commit target: `Add safe Sarvam tool-loop mutation smoke`

### 3. RLM State Spine

Add file-backed external state:

- JSONL trajectory log
- active context document
- compaction summary
- child-call trace log
- replayable session manifest

Commit target: `Add RLM-style file-backed state spine`

### 4. Sarvam 105B Subagent Design

Design subagents as bounded roles using Sarvam 105B initially:

- `scout`: read/search/summarize
- `worker`: bounded edits in assigned paths
- `reviewer`: inspect diff, risks, missing tests

The design must define tool access, state handoff, and how child calls are recorded into RLM state.

Commit target: `Design Sarvam subagent roles and RLM state handoff`

## Operating Rules

- Commit and push after each milestone where possible.
- If network push is unavailable, commit locally and report the blocked push.
- Do not modify `pi-mono/` during this sprint.
- Keep the provider adapter small and explicit until Sarvam's protocol behavior is proven.
- Treat repeat mechanical failures as harness bugs, not model failures.
