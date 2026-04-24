# RLM State Pi Extension

Pi extension that exposes the file-backed RLM state spine as tools.

Load it alongside the Sarvam provider:

```powershell
node .\pi-mono\packages\coding-agent\dist\cli.js `
  -e .\packages\sarvam-provider\index.ts `
  -e .\packages\rlm-state-extension\index.ts `
  --provider sarvam `
  --model sarvam-105b `
  --tools read,grep,find,ls,rlm_create_session,rlm_append_trajectory,rlm_read_context,rlm_write_context,rlm_write_compaction,rlm_append_child_call
```

State is written under `.sarvam-pi/rlm-state/`, which is ignored by git.
