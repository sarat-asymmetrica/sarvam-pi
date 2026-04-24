# RLM State

External state layer for recursive language-model execution experiments.

The first implementation is intentionally file-backed. It gives the harness durable state without adding database complexity.

## Files

Default root:

```text
.sarvam-pi/rlm-state/
  sessions/
    <session-id>/
      manifest.json
      trajectory.jsonl
      context.json
      compaction.md
      children.jsonl
```

## API Sketch

```ts
import { createRlmStateStore } from "./packages/rlm-state/index.ts";

const store = createRlmStateStore();
const session = await store.createSession("provider smoke");

await store.appendTrajectory(session.id, {
  type: "user_prompt",
  text: "Read README.md",
});

await store.writeContext(session.id, {
  summary: "Testing Sarvam tool use through Pi.",
  activeFiles: ["README.md"],
  openQuestions: [],
  invariants: ["Do not modify pi-mono/"],
});
```

## RLM Mapping

- `trajectory.jsonl`: full root execution trace
- `context.json`: current compact active state
- `compaction.md`: prompt-facing summary that can survive context pressure
- `children.jsonl`: recursive child/subagent calls and results
- `manifest.json`: replay and benchmark metadata

This mirrors the useful part of `C:/Projects/rlm`: keep context and history outside the prompt, then let the model operate over a compact active view.
