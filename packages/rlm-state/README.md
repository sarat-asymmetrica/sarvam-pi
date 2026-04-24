# RLM State

External state layer for recursive language-model execution experiments.

Planned persisted surfaces:

- active context summary
- full root trajectory
- compacted prompt summary
- branch and child-call metadata
- memory promotion candidates
- replay manifests for benchmarks

The first implementation should be file-backed JSONL so every experiment can be replayed without adding database complexity.
