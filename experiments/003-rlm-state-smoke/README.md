# Experiment 003: RLM State Smoke

Purpose: externalize context and history so compaction does not erase task continuity.

The first pass persists JSONL trajectories and separate compaction summaries through `packages/rlm-state`.

## Acceptance

- create a session manifest
- append at least one root trajectory event
- write and read active context
- write and read a compaction summary
- append at least one child-call record for a planned Sarvam 105B subagent
