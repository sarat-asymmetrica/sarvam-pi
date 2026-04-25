# Shoshin Math Primitives — Template Tree

Production-validated mathematical primitives that get copied into a target
app's `internal/math/<primitive>/` directory by `shoshin scaffold-math`.

Every primitive ships:
- **A self-contained Go package** with zero external deps
- **Table-driven tests** (`go test ./...` works in isolation here AND
  inside the target app's go.mod)
- **A package doc comment** linking to provenance: Lean proofs, Asymmetrica
  research notes, empirical validation experiments

## Wave 1 (this commit)

| Primitive | Purpose | Provenance |
|-----------|---------|------------|
| `digital_root` | O(1) DR + DR-chain + DR-Regime fusion | Lean `Day28_DigitalRoots_PartIX.lean`; Sarvam Exp 11 (88.9% pre-LLM filter); Vedic sutras 1 + 16 |
| `williams` | √n × log₂(n) batch sizing + spans | Ryan Williams sublinear-space; 2.7× pipeline speedup empirical |
| `quaternion` | S³ unit quaternion, SLERP, chain coherence/momentum/drift | Lean `Quaternion_S3_Norm_Invariant.lean`; Sarvam Exp 13 |
| `regime` | Three-regime classifier + boundary alerts | Lean `ThreeRegime_BoundaryAlerts.lean`; cross-domain Feb-28 sprint |

## ProjectSpec → Primitive Selection

The selection rules live in `packages/shoshin-harness/src/templates/mathprimitives.ts`.
Each primitive has a default-include trigger:

| Primitive | Default trigger | Always-on opt-in |
|-----------|-----------------|------------------|
| `digital_root` | `surfaces` includes telegram/miniapp/pwa OR `appShape == "api"` | `mathPrimitives: [digital_root]` |
| `williams` | `appShape == "api" / "web"` | `mathPrimitives: [williams_batching]` |
| `quaternion` | `surfaces` includes telegram/voice | `mathPrimitives: [slerp_state]` |
| `regime` | `doneInvariants` includes "observable" | `mathPrimitives: [regime_classifier]` |

## Adding a New Primitive

Drop a new directory at `templates/mathprimitives/<name>/` with:
1. `<name>.go` — package implementation (single file preferred; nested files allowed if needed for clarity)
2. `<name>_test.go` — table-driven tests
3. Optional `README.md` — extra context

Then add a selection rule in `src/templates/mathprimitives.ts` `selectPrimitives()`.

The harness will:
1. Pick it up automatically from any new ProjectSpec that triggers the rule
2. Copy it into `<app>/internal/math/<name>/` on `shoshin scaffold-math`
3. Track the write in `.shoshin/trail.jsonl` as a `memory_write` record

## Why "templates", not "library"?

Shoshin generates apps that run independently of the harness. Embedding the
math as a copied template (not a vendored library) means the user's app has:
- No dependency on the Shoshin package
- Direct ownership of the code (modifiable, debuggable, vendorable)
- Independent versioning per primitive (the harness can ship updates as
  template-version bumps; users opt in by re-running scaffold-math)

This is the same pattern Asymmetrica uses for its production apps: math at
the heart, not at the import boundary.

---

**Run all tests in this template tree:** `go test ./... ` from this directory.
