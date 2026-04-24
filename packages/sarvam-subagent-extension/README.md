# Sarvam Subagent Pi Extension

Narrow subagent tool for launching child Pi processes with Sarvam 105B.

The first smoke should use `scout` only. The tool can optionally append planned/completed child-call records into RLM state when given a `sessionId`.

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

## Smoke Prompt

```text
Create an RLM session titled "subagent smoke". Then use sarvam_subagent with role scout to inspect packages/sarvam-provider/index.ts and summarize the provider responsibilities. Record the child call in the RLM session. Then summarize the scout result.
```
