# .shoshin/

This directory is managed by the Shoshin harness. Track everything here in git EXCEPT
`trail-*.jsonl` rotation files.

| File              | Purpose                                                       |
|-------------------|---------------------------------------------------------------|
| spec.json         | ProjectSpec — what this app is, written by `shoshin spec`. |
| features.json     | Feature Done Contract state — `shoshin features` manages.  |
| trail.jsonl       | Stigmergy event log (append-only).                            |
| roles.json        | Per-project role catalog overrides (optional).                |
| personas.json     | Per-project persona-pair overrides (optional).                |
| config.json       | Project-scoped Shoshin config.                                |

To inspect: `shoshin status`, `shoshin trail tail`.
