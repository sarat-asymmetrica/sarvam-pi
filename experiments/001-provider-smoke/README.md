# Experiment 001: Provider Smoke

Purpose: prove Sarvam can run as a Pi provider before exposing tools.

## Inputs

- `SARVAM_API_KEY`
- confirmed Sarvam chat-completions base URL
- confirmed Sarvam 105B model ID

## Procedure

1. Register `packages/sarvam-provider` as a Pi extension.
2. Run a single text-only prompt with tools disabled.
3. Repeat with streaming enabled.
4. Record request compatibility changes in `docs/EXPERIMENT_LOG.md`.

## Acceptance

- provider appears in model selection
- text response succeeds
- no tool schemas are sent
- any auth or shape failure produces a concrete next change
