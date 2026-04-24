# Mutation Safety

## Scope

Mutation tools are only safe after read-only tools are stable. The first write/edit tests must target disposable files under `experiments/002-tool-loop-smoke/fixture/`.

## Initial Allowed Target

```text
experiments/002-tool-loop-smoke/fixture/agent-notes.md
```

## Rules

- Read before editing.
- Edit one file at a time.
- Verify by reading after editing.
- Do not edit `pi-mono/`.
- Do not edit secrets or environment files.
- Prefer `edit` for small changes and `write` only for new disposable files.
- Treat repeated schema drift as a provider/tool-wrapper bug.

## Known Sarvam Argument Drift

The provider currently normalizes:

- `file_path`, `filePath`, `filepath` to `path`
- `old_string`, `oldString` to `oldText`
- `new_string`, `newString` to `newText`
- `cmd` to `command`

The provider also converts legacy single-edit calls into Pi's `edits: [{ oldText, newText }]` shape.

## Smoke Prompt

```text
Use read and edit only. Open experiments/002-tool-loop-smoke/fixture/agent-notes.md. Replace the TODO line with one sentence saying the Sarvam Pi mutation smoke passed. Then read the file again and summarize the exact change.
```
