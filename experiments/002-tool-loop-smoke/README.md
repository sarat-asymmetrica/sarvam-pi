# Experiment 002: Tool Loop Smoke

Purpose: verify Sarvam can use a minimal safe tool loop.

Start with read-only tools, then add mutation tools against the disposable fixture in this directory. Do not point mutation prompts at `pi-mono/` or harness source files until the fixture passes.

## Read-Only Command

```powershell
node .\pi-mono\packages\coding-agent\dist\cli.js `
  -e .\packages\sarvam-provider\index.ts `
  --provider sarvam `
  --model sarvam-105b `
  --tools read,grep,find,ls
```

## Mutation Command

```powershell
node .\pi-mono\packages\coding-agent\dist\cli.js `
  -e .\packages\sarvam-provider\index.ts `
  --provider sarvam `
  --model sarvam-105b `
  --tools read,grep,find,ls,edit,write,bash
```

## First Mutation Prompt

```text
Use read and edit only. Open experiments/002-tool-loop-smoke/fixture/agent-notes.md. Replace the TODO line with one sentence saying the Sarvam Pi mutation smoke passed. Then read the file again and summarize the exact change.
```

## Acceptance

- Sarvam reads the fixture before editing.
- Sarvam edits only `experiments/002-tool-loop-smoke/fixture/agent-notes.md`.
- Sarvam verifies the edit by reading the file again.
- If the edit schema drifts, the provider normalizes it or the error explains the retry.
