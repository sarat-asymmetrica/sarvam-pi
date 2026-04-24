# Experiment 003: RLM State Smoke

Purpose: externalize context and history so compaction does not erase task continuity.

The first pass persists JSONL trajectories and separate compaction summaries through `packages/rlm-state`.

## Acceptance

- create a session manifest
- append at least one root trajectory event
- write and read active context
- write and read a compaction summary
- append at least one child-call record for a planned Sarvam 105B subagent

## Command

```powershell
node .\pi-mono\packages\coding-agent\dist\cli.js `
  -e .\packages\sarvam-provider\index.ts `
  -e .\packages\rlm-state-extension\index.ts `
  --provider sarvam `
  --model sarvam-105b `
  --tools read,grep,find,ls,rlm_create_session,rlm_append_trajectory,rlm_read_context,rlm_write_context,rlm_write_compaction,rlm_append_child_call
```

## Prompt

```text
Create an RLM session titled "rlm smoke". Record a trajectory event saying the RLM tools are being tested. Write context with summary "Testing external state for sarvam-pi", activeFiles ["packages/rlm-state/index.ts"], openQuestions [], and invariants ["Do not modify pi-mono"]. Read the context back. Write a short compaction summary. Append a planned scout child call using sarvam/sarvam-105b. Then summarize what state you created.
```
