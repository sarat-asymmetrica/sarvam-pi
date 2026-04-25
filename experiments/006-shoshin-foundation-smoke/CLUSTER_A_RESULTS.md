# Experiment 006 — Shoshin Foundation Smoke (Cluster A Results)

**Date:** 2026-04-25
**Cluster A:** Phases 1–4 (package bootstrap, ProjectSpec, Feature state machine, Trail).
**Status:** PASSED.

---

## What Cluster A Delivered

Foundation scaffolding for the Shoshin harness on top of the sarvam-pi engine layer. End-to-end loop without any Sarvam call yet — this verifies the *substrate* before adding LLM-driven dispatch in Cluster B/C.

### Components built

| Phase | Module | Files |
|-------|--------|-------|
| 1 | Package bootstrap | `package.json`, `tsconfig.json`, `bin/shoshin.js`, `src/cli.ts`, `src/index.ts`, `src/util/{paths,json-io}.ts` |
| 2 | ProjectSpec | `src/spec/{types,store,interview,cli}.ts` (zod-validated, 12-question interview, JSON import) |
| 3 | Feature state machine | `src/features/{types,store,transitions,cli}.ts` (8-state machine with evidence gates) |
| 4 | Stigmergy trail | `src/trail/{types,writer,reader,cli}.ts` (append-only JSONL, 14 record kinds) |

Plus stub modules so cli.ts compiles cleanly: `src/{rhythm,roles,capabilities}/`.

---

## Smoke run

Fixture: `experiments/006-shoshin-foundation-smoke/fixture/`.

```
$ shoshin init shoshin-smoke
✓ Shoshin initialized at .../fixture/.shoshin
  Next: `shoshin spec` to run the discovery interview.

$ shoshin spec --non-interactive sample-spec.json
✓ Wrote .../.shoshin/spec.json
  name: shoshin-smoke
  goal: Foundation acceptance fixture for Shoshin harness Cluster A.
  stack: go

$ shoshin features add "say-hello"
✓ Added feature say-hello (REQUESTED)

$ shoshin features advance "say-hello"
✗ SCAFFOLDED requires scopePath set on feature        # ← evidence gate fired correctly

$ # (manually set scopePath + create dir)
$ shoshin features advance "say-hello"
✓ say-hello: REQUESTED → SCAFFOLDED

$ shoshin features advance "say-hello" --evidence "implemented Sayer struct in say_hello.go"
✓ say-hello: SCAFFOLDED → MODEL_DONE

$ shoshin trail tail
2026-04-25 00:53:31  memory_write         .shoshin/ +0B
2026-04-25 00:53:49  spec_written         shoshin-smoke (imported)
2026-04-25 00:54:03  feature_advance      say-hello REQUESTED → SCAFFOLDED
2026-04-25 00:54:04  feature_advance      say-hello SCAFFOLDED → MODEL_DONE
                                          — implemented Sayer struct in say_hello.go
```

---

## Acceptance Checks

- [x] `shoshin --help` lists 8 subcommands without import errors
- [x] `shoshin init` creates `.shoshin/` with `features.json`, `config.json`, `README.md`, and `.gitignore` patches
- [x] `shoshin spec --non-interactive <file>` validates and persists a ProjectSpec
- [x] `shoshin features add` creates a slugged `REQUESTED` feature
- [x] `shoshin features advance` enforces evidence requirements (rejected case verified)
- [x] State machine ordering enforced (no skip, no backward)
- [x] `shoshin features status` shows full history with evidence
- [x] `shoshin trail tail` displays kind-colored, timestamped records
- [x] Trail JSONL is append-only, parseable, and one record per operation
- [x] Atomic JSON writes (writeJson uses .tmp + rename)

---

## Observed Behaviors Worth Noting

1. **Evidence gates are enforceable today.** The `evidenceOk()` function in `transitions.ts` already rejects nonsense advances. As Phase 5+ adds role-driven advance, this gives the orchestrator a refusal-from-the-substrate that does not require Sarvam to comply — the harness itself is the contract.

2. **Trail discriminated union scales.** 14 record kinds are pre-typed; new kinds can land in a single new file by extending the union. Tail rendering uses one switch on `kind` and never resorts to heuristics.

3. **JSONL today, Cap'n Proto tomorrow.** Writing JSONL records that are 1:1 with the future Cap'n Proto schema means migration is a serialization change, not a semantic one.

4. **Zod validates at every boundary.** `readSpec()` and `readFeatures()` both run schema validation on every read. This catches drift if a user hand-edits the JSON files.

---

## Cluster B Plan (Next)

Phases 5–8: Roles + Capabilities + Memory + Time-awareness. Once these land, Phase 9 wires them into the orchestrator core loop (Cluster C), and we get our first real Sarvam call through the harness.

The foundation plan in `docs/SHOSHIN_FOUNDATION_PLAN.md` is the source of truth.
