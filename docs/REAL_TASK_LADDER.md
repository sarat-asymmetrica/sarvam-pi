# Real Task Ladder

The task ladder is the proving ground for the reliable coding agent. Each rung is a real user-shaped task with an expected artifact, gate set, and reliability signal. The goal is to grow complexity deliberately instead of relying on one-off dogfood prompts.

## Principles

- Start from tasks a non-specialist can describe.
- Keep every rung runnable from a fresh fixture.
- Prefer deterministic gates over subjective success claims.
- A blocked run is acceptable only when it leaves a clear blocked-result diagnostic.
- Promote a rung only after the report command can explain the run in plain language.

## Ladder

| Rung | Name | User-Shaped Request | Expected Artifact | Primary Gates | Current Smoke |
| --- | --- | --- | --- | --- | --- |
| L1 | Single-file utility page | "Make me a small offline page that stores and shows my entries." | `app/index.html` | mutation, HTML static, browser behavior | `030-clean-spa-dogfood` |
| L2 | Multi-action single-file SPA | "Make a polished planner with add, delete, totals, empty state, and persistence." | `app/index.html` | mutation, HTML static, browser behavior, report | `030-clean-spa-dogfood` |
| L3 | Scoped library implementation | "Add the calculation/classification logic inside this package only." | scoped source file | mutation, compile/import, scope | `024-scope-aware-repair` |
| L4 | Existing-code bugfix | "This existing app has a failing behavior; fix the smallest path." | modified existing file | browser behavior, repair delta, duplicate-failure guard | planned |
| L5 | Multi-file vanilla app | "Split the app into HTML, CSS, and JS while preserving behavior." | `index.html`, `styles.css`, `app.js` | mutation, HTML static, browser behavior, artifact report | planned |
| L6 | Small API service | "Build a small local API with validation and tests." | server module + tests | mutation, compile/import, tests | planned |
| L7 | Fullstack persistence slice | "Build a tiny UI plus local persistence/API flow." | frontend + backend slice | browser behavior, compile/import, report, quality block | planned |
| L8 | Refactor with tests | "Improve this code without changing behavior." | changed implementation + passing tests | tests, mutation scope, report | planned |

## Promotion Rules

A rung is considered active when:

- It has a fixture or smoke under `experiments/`.
- It can run from an empty or reset fixture.
- It records session summaries or an explicit skip reason.
- It records gates relevant to the artifact type.
- `shoshin report <feature>` explains success or blockage.

A rung is considered stable when:

- It passes twice in a row or quality-blocks with a crisp diagnostic.
- Token usage does not grow without corresponding artifact progress.
- The next action is obvious from the report.

## Bundle 42 Output

Bundle 42 adds this ladder plus a machine-readable fixture at `experiments/042-real-task-ladder/task-ladder.json`. Later bundles should update both files when a rung is promoted or a new smoke is added.
