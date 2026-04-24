# sarvam-pi

Experimental harness for running Sarvam 105B as a root coding agent with Pi-style tooling, RLM-inspired external state, and narrow Asymmetrica Runtime tool access.

This repo intentionally keeps `pi-mono/` as an ignored upstream reference clone. Do not modify or commit it during the first experiments; build provider extensions, tool wrappers, state managers, and experiment scripts in the outer repo.

## Goal

The near-term goal is to prove that Sarvam can handle tool-heavy coding-agent sessions without routing those turns to Grok. The harness should meet Sarvam where it is:

- explicit provider configuration using Sarvam's `api-subscription-key` header
- minimal, strongly described tools with recoverable error messages
- Windows-safe path handling in the tool layer
- full trajectory state outside the prompt
- compaction summaries that can survive context pressure
- small, read-only Asymmetrica Runtime tools before broader runtime access

## Repository Shape

```text
docs/
  HARNESS_DESIGN.md
  EXPERIMENT_LOG.md
packages/
  sarvam-provider/
  sarvam-tools/
  rlm-state/
  rlm-state-extension/
  sarvam-subagent-extension/
  .pi/
    agents/
experiments/
  001-provider-smoke/
  002-tool-loop-smoke/
  003-rlm-state-smoke/
  004-asymm-runtime-smoke/
```

## First Experiment

Experiment 001 registers Sarvam as a Pi provider using Pi's extension API and OpenAI Chat Completions compatibility layer. The first smoke test should verify plain chat before exposing any tools.

Expected local secret:

```powershell
$env:SARVAM_API_KEY = "<secret>"
```

The provider sketch lives in `packages/sarvam-provider/`. It is intentionally a design scaffold, not a production package yet.

## Guardrails

- Keep `pi-mono/` read-only unless we explicitly decide to fork Pi.
- Keep Sarvam-specific quirks in provider/tool extensions rather than prompt-only instructions.
- Add one tool family at a time and log failures in `docs/EXPERIMENT_LOG.md`.
- Treat Ananta production integration as a later feature-flagged migration after repeatable harness results.
