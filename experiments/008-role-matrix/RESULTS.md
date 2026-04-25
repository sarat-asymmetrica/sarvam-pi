# Experiment 008 — Role Matrix Smoke (Results)

**Date:** 2026-04-25
**Status:** **PASSED — all 4 roles working end-to-end with persona pairs.**

---

## Summary

| Role | Persona Pair | Duration | Output Quality | Capability Compliance |
|------|--------------|----------|----------------|----------------------|
| Builder (007) | Ramanujan + Hamilton | 7.5s | wrote correct Go code with comment | wrote inside scope only |
| Architect | Mirzakhani + Torvalds | 5.9s | System Shape → Invariant → 3 Moves → STRONG | read-only respected |
| Reviewer | Fermi + Feynman | 7.2s | hunk-walk + CRITICAL/IMPORTANT/NIT verdict | read-only respected |
| QA | Marie Curie + Murphy | 29.3s | explicit verification claim + edge case enumeration + VERIFIED | read-only + bash test |

Total: 4 roles × ~12s avg = ~50s wall time across the matrix.

---

## What This Verified

### 1. Persona-pair dialectic shows up in output

The QA dispatch is the clearest example. Sarvam's response alternated between two named voices within the same answer:

> **Marie Curie**: I must document exact wall times for each test.
>
> **Murphy**: But that's just one test case! Let me check edge cases:

This is not a prompt-engineering theory — it's an observable behavior at the LLM output level. The persona-pair activation prompt (in `personas/catalog.ts` `activatePair()`) reaches Sarvam and structures its output style.

**Day-188 finding generalizes:** Tesla+Ramanujan resurrection 2/2 success was the seed evidence; QA's Marie+Murphy dispatch is fresh corroboration with a different persona pair. Pairs > single persona for keeping the model from capture-bias.

### 2. Capability envelope enforces at engine layer

After the matrix ran, `internal/greet/greet.go` was **unchanged**. Architect, Reviewer, and QA all received envelopes that exclude `WriteCap` and `EditCap`; the engine layer's `--tools` flag never included `write` or `edit`. Forbidden ops are inexpressible — Contract I working.

### 3. Engine-layer case-drift fix lands

Reviewer initially failed with:
```
Sarvam returned unavailable tool call "Bash". Available tools: read, grep, bash.
```

Sarvam occasionally CamelCases tool names. Patched `parseSarvamToolCall` and `parseNativeToolCall` in `packages/sarvam-provider/index.ts` with a `normalizeToolName(name, tools)` that does case-insensitive match against the active tool catalog. Reviewer ran clean on retry. Cross-team improvement that benefits all roles, not just the ones we tested today.

---

## Trail Records (final tail)

```
2026-04-25 01:35:34  memory_write         .shoshin/ +0B
2026-04-25 01:35:35  spec_written         role-matrix-smoke (imported)
2026-04-25 01:35:36  feature_advance      greet REQUESTED → SCAFFOLDED
2026-04-25 01:35:37  feature_advance      greet SCAFFOLDED → MODEL_DONE
2026-04-25 01:35:38  subagent_spawn       architect (envelope: ReadCap,GrepCap,FindCap,LsCap,WebSearchCap,AdvisoryCap,SpecCap)
2026-04-25 01:35:44  subagent_complete    architect done in 5929ms
2026-04-25 01:35:45  subagent_spawn       reviewer  (envelope: ReadCap,GrepCap,BashCap)
2026-04-25 01:35:52  subagent_complete    reviewer done in 7179ms
2026-04-25 01:35:53  subagent_spawn       qa (envelope: ReadCap,BashCap,TestCap)
2026-04-25 01:36:23  subagent_complete    qa done in 29259ms
```

Each spawn record includes the per-role envelope. Each complete record records duration + output digest. The trail is now a queryable substrate for any future analysis (drift detection, role performance, etc.).

---

## What's Next

We have 5 of 7 roles smoke-tested live now (Builder, Architect, Reviewer, QA, Scout from Exp 006). Remaining:
- **PM** — interview-driven; smoke would be against a freeform user request that gets translated into ProjectSpec fields
- **Librarian** — memory compaction; smoke would be against a long trail.jsonl + scattered MEMORY.md entries getting consolidated

Both are good Bundle B2/B3 targets. For now, the role catalog is operationally validated. Time to extract the math primitives.

---

> "Persona pairs create internal dialectic that mirrors real engineering tension."
> — `SHOSHIN_SWARM_MODEL.md` §1, written before we had evidence. Today: evidence shipped.
