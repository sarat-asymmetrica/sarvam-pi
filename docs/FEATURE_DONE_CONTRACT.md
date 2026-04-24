# Feature Done Contract

**Date:** 2026-04-24
**Philosophy source:** `SHOSHIN_HARNESS_PHILOSOPHY.md` Inversion #7
**Status:** Design spec; implementation deferred until `scaffold_app` engine lands.

---

## The Problem

Three weeks into any vibe-coded project, the codebase has this shape:

- 14 files with beautifully typed functions
- 3 Go routes that compile
- 1 React component that exists
- **Zero paths where a button click actually produces the intended result**

AI marked each piece "done" after writing it. Each piece *is* locally correct. The failure is that no one asked *"does pressing Save Invoice actually save an invoice?"* until week 3, when the user tries it and nothing works.

**Root cause:** AI agents inherit production-org assumptions (Jira tickets, microservice boundaries, handoff phases between teams). They write code and treat wiring as "a later phase." For solo vibe coders, there is no QA team to catch integration gaps, so *"code written but not wired"* silently accumulates. The feature graveyard.

---

## The Contract

Every feature the harness tracks moves through a **state machine** with **evidence required to advance each state**. The AI literally cannot mark a feature "done" without producing the evidence for the final state.

```
REQUESTED → SCAFFOLDED → MODEL_DONE → VM_DONE → VIEW_DONE → WIRED → VERIFIED → DONE
```

### State definitions and evidence

| State | Meaning | Evidence to advance |
|-------|---------|---------------------|
| **REQUESTED** | User has described the feature in natural language | None; entering state is automatic on request |
| **SCAFFOLDED** | Required files exist on disk at correct layer paths | `ls` confirms all expected files present |
| **MODEL_DONE** | Data types + invariants defined and tested | `go test ./model/...` passes (or language equivalent) |
| **VM_DONE** | State + actions defined, tested without UI | `go test ./viewmodel/...` passes |
| **VIEW_DONE** | UI renders without runtime error | App launches and the view displays without crash |
| **WIRED** | V → VM → M reach each other end-to-end | A write-to-storage round trip succeeds via the UI surface (not just unit tests) |
| **VERIFIED** | End-to-end demo flow runs | Integration test green, or scripted click-through produces expected result |
| **DONE** | Human has confirmed behavior matches intent | Explicit user confirmation: *"yes, this does what I wanted"* |

### Enforcement

- AI response schemas include a `feature_state` field when discussing a feature
- AI *may not* advance a feature's state without attaching the evidence artifact (test output, log excerpt, user confirmation quote)
- Harness maintains `.shoshin/features.json` — truth-source for every feature's current state
- Any claim of "DONE" without human confirmation auto-reverts to the prior state + flags for review

---

## Directory Shape Enforces the Separation

The `scaffold_app` engine emits the following structure by default for any app (adapt paths to language):

```
<app>/
  internal/
    model/      ← M: pure data + invariants (no I/O, no UI)
    viewmodel/  ← VM: state + actions (testable without UI)
    view/       ← V: dumb rendering only
    wiring/     ← bootstrap: main.go, main.ts, Program.cs — where layers connect
  integration/
    ← E2E tests; VERIFIED gate lives here
  .shoshin/
    features.json    ← state tracker
    snapshots/       ← per-edit rollback tarballs
```

Directory shape *is* the enforcement. AI cannot write a monolithic `handlers.go` by accident — no such directory exists. AI must choose a layer, and the layer's files are the right place for the layer's work.

### MVVM across frameworks

| Stack | M | VM | V | Wiring |
|-------|---|----|----|--------|
| Go + Fyne (desktop) | `model/invoice.go` | `viewmodel/invoice_vm.go` | `view/invoice_window.go` | `cmd/app/main.go` |
| Go + HTMX (web) | `model/...` | `handlers/...` (state + actions) | `templates/...` | `cmd/server/main.go` |
| React/Svelte | `model/types.ts` | `stores/invoice.ts` | `components/InvoiceForm.tsx` | `App.tsx` / bootstrap |
| .NET + WinUI | `Models/Invoice.cs` | `ViewModels/InvoiceVM.cs` | `Views/InvoicePage.xaml` | `App.xaml.cs` |
| Vanilla JS | `model/invoice.js` | class-based controller | DOM updates | `index.js` |

Same mental model, any stack. Vibe coder learns one separation; future LLM instance entering the repo reads the structure and knows where to put new code.

---

## The Anti-Graveyard Diagnostic

Alongside the state machine, the harness ships a **wiring lint** command:

```bash
shoshin lint:wiring
```

Scans the repo and reports:

- Model structs defined but never persisted or queried
- ViewModel methods defined but never invoked from any View
- View components rendered but with no VM bindings
- Integration test files that import but don't exercise end-to-end paths

Vibe coder can run it any time to see the *true* state of the app. AI runs it before reporting "done" to self-catch graveyards. **The failure mode becomes visible, which is the first step to making it rare.**

---

## Escape Hatch for Tiny Utilities

Not every app needs three layers. A 200-LOC text-case-converter CLI doesn't need `model/viewmodel/view/wiring/`. The contract provides a declared escape:

### `scaffold_mode`

Set at project spec time. Values:

- `full_mvvm` — all four layers enforced (default for any app with UI + persistence)
- `lite` — single package, MVVM discipline encouraged in code structure but no directory enforcement (default for CLI tools, single-file scripts, utilities under ~300 LOC)
- `custom` — user names the layer set explicitly (only after demonstrating repeatable pattern success)

The mode is recorded in `.shoshin/project.json` and used by the harness for lint decisions. `lite` mode still enforces the state machine; only the directory enforcement relaxes.

---

## Interaction with Contract C (Cheap Reversal)

Every state transition is snapshotted:

```
.shoshin/snapshots/
  <timestamp>-<feature>-<from_state>-to-<to_state>/
    diff.patch
    state.json
```

If a feature advances to WIRED and the wiring immediately breaks something, **one command** rolls back to the prior state + restores the files + advances the feature-state ledger accordingly. Exploration stays cheap.

---

## Interaction with Contract E (Visible Intent)

When AI proposes to advance a feature state, it emits (visible to user):

```
Feature: invoice_save
  State: WIRED → VERIFIED
  Evidence: integration/invoice_e2e_test.go:TestInvoiceSaveRoundtrip — PASS (320ms)
  Proceed? [y/n]
```

User sees the intent and the evidence. Confirms once. Harness updates the ledger. Zero ambiguity about what just happened.

---

## Why This Is the Load-Bearing Inversion

Inversion #2 ("start minimal, grow incrementally") only works if each increment is *actually a working addition*, not a theoretical one. Without the Feature Done Contract, "start minimal" devolves into "start minimal and then accumulate unwired debris for 3 weeks." With it, every growth step is genuinely load-bearing.

The Contract is how we prevent the feature graveyard at the harness level, so the vibe coder never has to learn "why senior devs say it's not done until it runs" by living through the pain themselves.

---

## Implementation Order

1. **features.json schema + state machine** — simple JSON file + state-transition validator
2. **scaffold_mode discrimination** in `scaffold_app` output
3. **wiring lint** diagnostic (static analysis per layer)
4. **snapshot-on-transition** (integrate with Contract C's rollback system)
5. **AI schema extension**: `feature_state` field required when discussing a feature
6. **UI rendering**: surface state + evidence to user before advance

Landed in that order, each piece is independently useful even if later pieces stall.
