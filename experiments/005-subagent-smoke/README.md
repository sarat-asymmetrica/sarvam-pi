# Experiment 005: Sarvam Subagent Smoke

Purpose: launch a child Pi process using Sarvam 105B and record the child call in RLM state.

## Command

```powershell
node .\pi-mono\packages\coding-agent\dist\cli.js `
  -e .\packages\sarvam-provider\index.ts `
  -e .\packages\rlm-state-extension\index.ts `
  -e .\packages\sarvam-subagent-extension\index.ts `
  --provider sarvam `
  --model sarvam-105b `
  --tools read,grep,find,ls,rlm_create_session,rlm_append_child_call,sarvam_subagent
```

## Prompt

```text
Create an RLM session titled "subagent smoke". Then use sarvam_subagent with role scout to inspect packages/sarvam-provider/index.ts and summarize the provider responsibilities. Record the child call in the RLM session. Then summarize the scout result.
```

## Acceptance

- root Sarvam creates an RLM session
- root Sarvam calls `sarvam_subagent`
- child Sarvam runs with role `scout`
- child output returns to root
- `children.jsonl` contains running/completed records for the scout call
