# Sarvam Subagent Design

## Goal

Use Sarvam 105B for root and child agents until the harness is reliable. Smaller Sarvam models can be introduced later for specific bounded roles after we have measurements.

## Initial Roles

### scout

Purpose: gather context without changing files.

Model: `sarvam/sarvam-105b`

Tools:

```text
read, grep, find, ls
```

Output contract:

- concise findings
- relevant file paths
- open questions
- suggested next files to inspect

RLM state writes:

- append `children.jsonl` record with role `scout`
- append root trajectory summary of files inspected
- update `context.json.activeFiles` when useful

### worker

Purpose: perform bounded implementation work in assigned paths.

Model: `sarvam/sarvam-105b`

Tools:

```text
read, grep, find, ls, edit, write, bash
```

Constraints:

- must receive an explicit write scope
- must read before editing
- must verify changes after editing
- must not touch `pi-mono/`

RLM state writes:

- append `children.jsonl` record with role `worker`
- append changed file list to trajectory
- leave enough output for reviewer handoff

### reviewer

Purpose: inspect diffs, risks, missing tests, and protocol violations.

Model: `sarvam/sarvam-105b`

Tools:

```text
read, grep, find, ls, bash
```

Output contract:

- findings first, ordered by severity
- file references where possible
- residual risk and test gaps

RLM state writes:

- append `children.jsonl` record with role `reviewer`
- append review findings to trajectory
- update `context.json.openQuestions` if unresolved risks remain

## Pi Integration Strategy

Pi's example subagent extension launches separate `pi` subprocesses with isolated context windows. The first Sarvam version should adapt that shape, but with project-local agent definitions and this provider extension loaded for every child process.

Child process command shape:

```powershell
node .\pi-mono\packages\coding-agent\dist\cli.js `
  -e .\packages\sarvam-provider\index.ts `
  --provider sarvam `
  --model sarvam-105b `
  --tools <role-tools> `
  --print `
  "<role prompt + task>"
```

The first implementation should be sequential before parallel. Parallel child calls are useful, but they complicate state writes and output ordering.

## RLM Handoff

Every child call should create a record:

```json
{
  "role": "scout",
  "model": "sarvam/sarvam-105b",
  "status": "completed",
  "input": { "task": "Find provider auth code" },
  "output": { "summary": "...", "files": ["packages/sarvam-provider/index.ts"] }
}
```

The root agent receives a compact synthesis, while raw child outputs remain in `children.jsonl`.

## Project Agent Definitions

Planned project-local definitions:

```text
.pi/agents/scout.md
.pi/agents/worker.md
.pi/agents/reviewer.md
```

They should be treated as harness code and committed. The extension can load them with `agentScope: "project"` once we trust the repo.

## First Workflow

1. Root receives a task.
2. Root asks `scout` to inspect relevant files.
3. Root updates RLM context with scout output.
4. Root either handles the change directly or delegates to `worker` with explicit write scope.
5. Root asks `reviewer` to inspect the diff.
6. Root commits only after review findings are addressed or accepted.

## Open Questions

- Whether Sarvam should use native tool calls or the XML-ish bridge inside child processes.
- Whether child state writes should happen inside the subagent tool or only after root receives results.
- How much of the symbolic reasoning substrate should be in role prompts versus RLM state fields.
