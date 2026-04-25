# Pi Internals Map (B9-T2)

*Research pass: April 25, 2026. Author: Zen Gardener subagent.*

---

## What is Pi today

Pi is a full-featured coding-agent CLI built on top of the `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai` packages. Its architecture is a three-layer stack: a **provider abstraction layer** (`pi-ai`) that translates LLM responses into a normalized event stream; an **agent loop layer** (`pi-mono/packages/agent`) that drives the tool-call/response cycle and emits typed events; and a **session layer** (`coding-agent`) that adds session persistence, compaction, extension hooks, and the three run-modes (interactive TUI, print, and RPC).

**`--print` mode** (`-p`) is a headless, single-invocation path: Pi creates a session, sends one or more pre-supplied messages sequentially, waits for each to complete (including all tool calls), outputs the final assistant text, then exits. There is no stdin loop. `--no-session` removes even the JSONL file persistence, making the invocation fully ephemeral.

The **session model** is a real, first-class feature: conversations are stored as append-only JSONL files in `~/.pi/agent/sessions/<encoded-cwd>/`, each entry carrying `id`/`parentId` to form a branching tree. `--continue` opens the most-recent file; `--session <uuid-prefix>` opens a specific one; `--fork` deep-copies one session into a new file. State that survives across turns includes the full message tree, thinking-level changes, model changes, compaction summaries, and extension-supplied custom entries.

The **provider layer** is open: extensions register providers via `pi.registerProvider()`. The sarvam-provider package (`packages/sarvam-provider/index.ts`) is a Pi extension that registers `sarvam` as a first-class provider, mapping the Sarvam OpenAI-compatible API onto Pi's internal event stream, including a tool-name normalization layer and a `shouldForceSynthesis` guard that prevents infinite tool loops.

---

## File-by-file map

### `pi-mono/packages/coding-agent/src/`

**`main.ts`** — CLI entry point (732 lines). Parses args, resolves session manager, builds a `CreateAgentSessionRuntimeFactory`, calls `createAgentSessionRuntime()`, then dispatches to one of the three run modes. The `--print` path ends at `runPrintMode(runtime, ...)` at line 718. The `--no-session` flag is translated to `SessionManager.inMemory()` inside `createSessionManager()` at line 220.

**`cli/args.ts`** — Arg parser. The `--print` / `-p` flag is a boolean at line 123; it is not a "mode" in the `--mode` sense — it just forces `resolveAppMode()` in `main.ts` to return `"print"`. `--no-session` is line 94. The `messages: string[]` field (line 46) accumulates positional args; these become the `messages` array passed to `runPrintMode`.

**`modes/print-mode.ts`** — `runPrintMode(runtimeHost, options)` (lines 32–158). This is where `--print` is actually implemented. It:
1. Calls `session.prompt(initialMessage)` then iterates `for (const message of messages) { await session.prompt(message) }` (lines 121–126).
2. After all prompts are exhausted, reads `session.state.messages` and emits the last assistant message's text blocks to stdout (lines 128–145).
3. Calls `disposeRuntime()` in the `finally` block.
There is **no re-entry point** and **no external session control**. Once this function returns, the process exits.

**`core/agent-session.ts`** — `AgentSession` class (~2500 lines). The central object shared by all modes. Key surfaces:
- `prompt(text, options?)` (line 941) — sends one user turn, waits for the full agent loop (including all tool calls and any auto-retry) to complete.
- `subscribe(listener)` (line 688) — event bus for the UI or `print-mode`'s JSON emitter.
- `sessionManager: SessionManager` — the JSONL persistence layer.
- `_handleRetryableError()` (line 2420) — exponential backoff retry with `settings.baseDelayMs * 2^(attempt-1)`, up to `settings.maxRetries`. The retry logic lives here, not in the agent loop.
- `_checkCompaction()` (line 1748 area) — auto-compacts on context overflow or token threshold breach.
- No per-turn cost or latency fields are stored on `AgentSession`. Token usage lives on each `AssistantMessage.usage` object.

**`core/session-manager.ts`** — `SessionManager` class (~1426 lines). The persistence layer. Stores entries as JSONL, builds a `byId` map for tree traversal. Key methods:
- `buildSessionContext()` (line 1049) — walks from current `leafId` to root, reconstructs the message list for the LLM, respecting compaction and branch summaries.
- `newSession()` / `SessionManager.create()` / `SessionManager.inMemory()` / `SessionManager.open()` / `SessionManager.continueRecent()` / `SessionManager.forkFrom()` — the full session lifecycle API already exists at line 1269–1357.
- `branch(id)` (line 1125) — moves `leafId` to an earlier entry, enabling new branches without touching history.
- Persistence is **lazy**: `_persist()` at line 801 defers writing to disk until the first assistant message arrives (to avoid orphan user-only files).

**`core/agent-session-runtime.ts`** — `AgentSessionRuntime` wraps `AgentSession` and `AgentSessionServices`. Owns session replacement (`newSession`, `fork`, `switchSession`). The `createRuntime` factory is injected from `main.ts`, making runtime creation composable without coupling to the CLI.

**`core/tools/index.ts`** — Tool registry. Seven built-in tools (lines 83–84): `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`. The default coding set is `[read, bash, edit, write]` (line 138). `grep`, `find`, `ls` are present but off by default (line 147). All are pure TypeBox schemas.

**`core/timings.ts`** — Startup-phase timing only (`PI_TIMING=1`). Not per-turn. No latency instrumentation for LLM calls.

**`modes/rpc/rpc-mode.ts`** — JSON-RPC over stdin/stdout. Relevant for programmatic callers: it exposes `prompt` as a command, streams events, and keeps the session open indefinitely. This is the **correct mechanical alternative** to the current `--print` + subprocess pattern for any caller that can own a long-lived process.

### `pi-mono/packages/agent/src/`

**`agent-loop.ts`** — The core turn loop. `agentLoop()` and `runLoop()` (lines 31, 155). The `while (true)` outer loop drives follow-up messages; the inner `while (hasMoreToolCalls || pendingMessages.length > 0)` (line 172) drives tool-call rounds within a single agent invocation. Tool execution is either sequential or parallel depending on tool `executionMode` (line 349). There is no built-in retry here — retries are delegated upward to `AgentSession._handleRetryableError()`.

### `packages/sarvam-provider/index.ts`

The Sarvam provider extension (657 lines). Key mechanisms:
- `normalizeToolName()` (line 433) — **B5 fix**: case-insensitive match against the live tool catalog so Sarvam's occasional `"Bash"` / `"Read"` capitalizations are silently corrected.
- `normalizeToolArguments()` (line 335) — maps `file_path`, `filePath`, `filepath` → `path`; `old_string`, `oldString` → `oldText`; `new_string`, `newString` → `newText`; wraps bare `oldText`/`newText` into the `edits` array for the `edit` tool.
- `shouldForceSynthesis()` (line 207) — counts tool results since the last user message; forces a synthesis pass (no tool calls allowed) when the count exceeds per-tool-class limits (read-only: 2, mutation: 4, RLM state: 8) or when the same file has been read twice. This prevents infinite tool loops on Sarvam, which does not reliably self-terminate.
- `validateToolCall()` (line 403) — blocks writes outside `SARVAM_PI_MUTATION_ROOT` and blocks edits to `pi-mono/`, `.env` files, secrets.
- Provider registration at line 619: models `sarvam-105b` (128K context, 8192 max tokens) and `sarvam-30b`.

---

## Tool surface today

| Tool | Built-in | Default on | Schema highlights | What's missing |
|------|----------|------------|-------------------|----------------|
| `read` | yes | yes | `path`, optional `limit`/`offset` | No `offset` param visible to callers via help (internal only) |
| `bash` | yes | yes | `command`, optional `timeout` (seconds) | No working-dir override per call; no output size limit negotiation |
| `edit` | yes | yes | `path`, `edits: [{oldText, newText}]` | No dry-run mode; no patch/diff format input |
| `write` | yes | yes | `path`, `content` | Full-overwrite only; no append mode |
| `grep` | yes | no | `pattern`, `path`, optional flags | Off by default; no AST search |
| `find` | yes | no | `pattern`, `path` | Off by default |
| `ls` | yes | no | `path` | Off by default |

**Absent tools** that production multi-turn coding agents routinely need:
- **Patch tool** — structured unified-diff application. The `edit` tool does string-match replacement, which fails on ambiguous or whitespace-sensitive files.
- **Language-server tool** — go-to-definition, find-references, diagnostics. Currently only achievable via `bash` + `jq` + LSP stdio.
- **Search/index tool** — semantic or trigram search over the codebase (GitNexus MCP fills this for Shoshin, but Pi itself has no native equivalent).
- **Web-fetch tool** — Pi has no built-in HTTP fetch; callers must use `bash` + `curl`.

Extension tools can be registered via `pi.registerTool()` in an extension file, loaded via `-e <path>`. The sarvam-subagent extension (`packages/sarvam-subagent-extension/index.ts`) adds RLM state tools (`rlm_*`).

---

## Session model

Pi has a **complete, production-grade session abstraction**. It is not a stub.

- **Storage format**: append-only JSONL at `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`. Each line is a `SessionEntry` with `id`, `parentId`, `type`, and `timestamp`. The header is always the first line (`type: "session"`). Current version: `CURRENT_SESSION_VERSION = 3` (`session-manager.ts` line 28).

- **`--no-session`**: calls `SessionManager.inMemory()` (line 1305), which sets `persist = false`. The session tree is built in memory and discarded on process exit. Conversation history is still available in-process (the agent loop needs it), but nothing is written to disk.

- **Default (persistent)**: `SessionManager.create(cwd)` generates a new UUID file under `~/.pi/agent/sessions/`. Entries are lazily flushed — the file is not created until the first assistant message arrives (`_persist()`, line 801).

- **State across turns**: When sessions are enabled, every `message_end` event causes `sessionManager.appendMessage()` to be called (`agent-session.ts` line 540). The full tree — all user messages, all assistant responses including tool calls, all tool results, compaction summaries, branch summaries, model-change markers — survives across process restarts. `buildSessionContext()` reconstructs exactly the LLM-visible message list by walking from `leafId` to root.

- **Conversation history format**: `AgentMessage[]` internally. At the LLM boundary, `convertToLlm()` in the agent loop translates to `Message[]` (the pi-ai wire format). The sarvam-provider's `buildMessages()` (line 131) then translates again to OpenAI-compatible JSON.

- **Resume capability hook**: `SessionManager.continueRecent(cwd)` and `SessionManager.open(path)` already exist. `--continue` and `--session` / `--resume` CLI flags wire these. The hook for a programmatic "resume" is `createSessionManager(parsed, cwd, sessionDir, settingsManager)` in `main.ts` (line 214) — a caller that constructs `Args` directly can inject any of these modes.

---

## The --print gap

**Where `--print` short-circuits the loop** (`print-mode.ts` lines 120–145):

```
if (initialMessage) { await session.prompt(initialMessage) }
for (const message of messages) { await session.prompt(message) }
// then emit last assistant text and exit
```

There is no loop, no stdin read, no re-entry. The function completes and `main.ts` calls `process.exit`. Each `session.prompt()` call does run a **full** agent loop internally (multiple tool-call rounds), so the "single-shot" refers to the number of external prompts, not the number of LLM turns.

**State lost on exit**:
- The in-memory `AgentSession` object (tool registry, extension runner state, scoped model list).
- Any work the LLM is mid-stream on (signal handlers catch SIGTERM).
- If `--no-session` is also passed: the entire conversation history.
- If `--no-session` is NOT passed: the JSONL file is persisted and `--continue` will recover it. However, Shoshin currently passes `--no-session` (dispatch.ts line 121), so history is always discarded.

**Why it was written this way**: The comment at `print-mode.ts` line 2 reads "Used for `pi -p "prompt"` - text output" and "process and exit". This is the canonical Unix tool-call pattern: invoke, get answer, exit. The design assumption is that the caller either (a) builds up a full prompt before invocation, or (b) manages multi-turn state externally. No comment explains a deliberate choice to exclude session support — it is an omission, not a decision.

**What a "multi-turn print mode" would look like**: The machinery already exists. `runPrintMode` currently iterates `options.messages[]`. A `--session <id>` flag combined with `--print` and a new message would open the existing session, send the message, output the response, and update the JSONL file. The caller could then call Pi again with the same session ID for the next turn. This would be zero new infrastructure — only the Shoshin dispatch would change to pass `--session $SESSION_ID` instead of `--no-session`.

---

## What Shoshin works around vs. what Pi should fix

**Current Shoshin workaround in `sarvam_interview.ts`** (lines 356–506):

Each host turn calls `dispatchSubagent()`, which spawns a fresh Pi process with `--no-session --print`. The entire conversation history is serialized into the `ticketBrief` string argument:

```typescript
const brief = buildTurnBrief(language, transcript, isLastSafetyTurn);
// transcript = full ConversationTurn[] array, all turns so far
```

The `buildTurnBrief()` function (line 124) serializes every prior HOST/USER turn as plain text into the system prompt body. This is the workaround: the transcript is the external session state, and it is re-sent in full on every invocation.

**Cost of this approach**: O(n) tokens per turn, where n is turn count. For a 12-turn interview, turn 11 sends roughly 11x the content of turn 1. The timeout per turn is 90s (`timeoutMs: opts.timeoutMsPerTurn ?? 90_000`). No shared in-process context means every turn pays cold-start cost (process spawn, extension load, provider initialization).

**What belongs permanently in Shoshin** (architectural choice, not scaffolding):
- Language detection (`detectLanguage()`, line 69) — pure Shoshin product logic, no reason for Pi to know about it.
- The `<<<DISCOVERY_COMPLETE>>>` protocol and spec validation (`extractSpec()`, `tryParseSpec()`) — Shoshin business logic.
- Role-based envelope translation (`capabilities/role-envelopes.ts`, `capabilities/to-pi-tools.ts`) — Shoshin's product-layer concern.
- The trail/stigmergy log (`trail/writer.ts`) — Shoshin's audit trail.

**What should migrate down into Pi when Pi exposes proper session APIs**:
- Session ID threading: currently Shoshin re-sends full history because it has no other option. If `dispatch` passed `--session $id` (creating on first call, resuming on subsequent calls), the history would live in Pi's JSONL, and each turn would only need to send the new user message.
- Timeout tracking: Shoshin sets a 90s wall-clock timeout at the subprocess level. With an in-process RPC session, this could be expressed as an AbortSignal with proper event-stream visibility into what's happening.
- Retry decisions: currently if `hostResult.ok === false`, Shoshin just breaks the loop. Pi's built-in `_handleRetryableError` with exponential backoff (lines 2416–2494 of agent-session.ts) would handle transient 429s/503s transparently.

---

## Reliability primitives Pi needs (gap list)

### For production multi-turn coding-agent work

- [ ] **Multi-turn session API (`pi session new`, `pi session resume`)**
  - *Why*: Without this, every turn is a cold start, full history re-send, O(n) token growth.
  - *Where it would land*: `dispatch.ts` in Shoshin calls Pi with `--session <id>` instead of `--no-session`. Pi's `createSessionManager()` (`main.ts:214`) and `SessionManager.open()` already handle this. Size: **S** (config change in dispatch, no new Pi code).

- [ ] **`--print` + `--session` combined (print-mode session threading)**
  - *Why*: Currently `--print` and `--session` are both valid flags but Shoshin deliberately uses `--no-session`. To thread sessions, dispatch needs to pass `--session $SARVAM_PI_SESSION_ID` on every call (creating on first, resuming on subsequent). The session file path would be returned in the `--mode json` header output (`session.sessionManager.getHeader()` at print-mode.ts:112).
  - *Where*: `dispatch.ts` (Shoshin) + `print-mode.ts` (Pi, already supports it but untested in this combination). Size: **S**.

- [ ] **Per-turn cost and latency telemetry emitted on stdout in `--mode json`**
  - *Why*: `dispatchSubagent` currently measures only wall-clock `durationMs` (dispatch.ts line 131). Token usage is on each `AssistantMessage.usage` object in-process but not surfaced to `print-mode` text output. Without this, Shoshin cannot do cost-aware routing or detect runaway sessions.
  - *Where*: `print-mode.ts` — emit a final `{type: "session_summary", tokens: {...}, cost: ..., durationMs: ...}` JSON event when `mode === "json"`. Token data is available via `session.state.messages`. Size: **S**.

- [ ] **Tool call retry with per-tool backoff**
  - *Why*: Pi's `_handleRetryableError` retries entire agent turns (LLM call failures). If a single `bash` command returns a transient error (network, flaky test), the agent must re-prompt. A tool-level retry would be more surgical.
  - *Where*: `agent-loop.ts` `executeToolCalls()` (line 337) — wrap `executePreparedToolCall` with configurable retry. Size: **M**.

- [ ] **Structured tool-result size budget (configurable per tool)**
  - *Why*: `bash` output truncation exists (`truncate.ts`) but is hardcoded at `DEFAULT_MAX_BYTES`. In multi-turn coding loops, a large `bash` output early in the session silently fills the context window. An explicit per-tool token budget, enforced at the tool boundary and reported in telemetry, would prevent context overflow surprises.
  - *Where*: `core/tools/bash.ts` `BashToolOptions` + `core/tools/read.ts` `ReadToolOptions`. Size: **M**.

- [ ] **Session health endpoint (`pi session status <id>`)**
  - *Why*: Shoshin currently has no way to know if a prior session is still valid, how full the context is, or whether it compacted. A status command that outputs `{contextTokens, maxTokens, turnCount, lastModified, compacted: bool}` would let Shoshin decide whether to continue or fork.
  - *Where*: New subcommand in `main.ts`, calls `SessionManager.open()` + `buildSessionContext()` + `calculateContextTokens()`. Size: **S**.

- [ ] **Abort signal propagation to subprocess from orchestrator**
  - *Why*: `dispatch.ts` uses `setTimeout` for a hard kill. If the parent process (Shoshin) is cancelled, the child Pi process keeps running until its own timeout (240s default). AbortController-based cancellation via `child.kill('SIGTERM')` on parent signal would clean this up. Currently only SIGTERM/SIGHUP are handled in `print-mode.ts` (lines 47–63), not injected from the outside.
  - *Where*: `dispatch.ts` — wire `AbortSignal` from the caller into the child process kill path. Size: **S**.

- [ ] **`--mode json` session header always includes session file path**
  - *Why*: The JSON header is emitted at `print-mode.ts:112` via `session.sessionManager.getHeader()`. This returns `{type, version, id, timestamp, cwd, parentSession}` — it does NOT include `sessionFile`. The caller cannot know where the JSONL was written without out-of-band knowledge. Adding `sessionFile: string | undefined` to the header output would make session threading trivially scriptable.
  - *Where*: `print-mode.ts` line 112, `session-manager.ts` `getHeader()`. Size: **XS**.

- [ ] **Extension tool name normalization exposed as config (not hardcoded regex)**
  - *Why*: The `normalizeToolName()` function in sarvam-provider (line 433) does a case-insensitive catalog lookup, which is the right fix. But this lives in the provider extension, meaning any new provider has to re-implement it. A Pi-core normalization hook (`beforeToolCall` already exists at agent-loop.ts:536) that optionally applies case-folding would make this provider-agnostic.
  - *Where*: `agent-loop.ts` `prepareToolCall()` or a new `normalizeToolName` hook in `AgentLoopConfig`. Size: **S**.

---

## Asymmetric advantages Pi has

**1. First-class branching session tree** (`session-manager.ts`). Most agent frameworks treat conversation history as a flat list. Pi's `id`/`parentId` tree model allows non-destructive branching (`branch(id)`, `branchWithSummary()`), fork-from-session (`SessionManager.forkFrom()`), and tree-to-context reconstruction (`buildSessionContext()` walks from leaf to root, respecting compaction boundaries). This is a genuine architectural advantage for multi-agent workflows where agents need to explore alternatives without corrupting the main branch.

**2. Auto-compaction with context-overflow recovery** (`core/compaction/`). Pi detects context overflow from the LLM response, removes the error message from agent state, compacts (summarizes) the conversation, and auto-retries the last prompt. This is transparent to the caller. Most engine layers require the caller to manage context manually.

**3. Capability envelope translation at dispatch** (Shoshin `capabilities/to-pi-tools.ts`). Role-based tool allowlists are translated to Pi's `--tools` flag, giving a hard runtime guarantee that a `reader` role cannot call `bash`. This is enforced by Pi's `--tools` allowlist, not just by prompt.

**4. Tool-name normalization for Sarvam** (`sarvam-provider/index.ts`, B5). Sarvam-105B occasionally emits camelCase or title-case tool names (`"Bash"`, `"Read"`). The `normalizeToolName()` function does a case-insensitive catalog lookup and maps to the canonical lowercase name. Without this, every such call would fail with "tool not found". This fix is upstream in the provider, not requiring Shoshin-layer workarounds.

**5. `shouldForceSynthesis` loop guard** (`sarvam-provider/index.ts` line 207). Sarvam does not reliably emit `stopReason: "stop"` after gathering enough context; it sometimes issues another tool call instead. The `shouldForceSynthesis` guard counts tool results and repeated reads, and when the threshold is hit, sends a synthesis-mode request (no tools in the request, synthesis-focused system prompt). This prevents infinite tool loops. The thresholds are tuned to Sarvam's observed behavior (2 for read-only, 4 for mutation).

**6. Mutation root scoping** (`sarvam-provider/index.ts`, `validateToolCall()` line 403). The `SARVAM_PI_MUTATION_ROOT` env var and `isSensitiveMutationPath()` check prevent any Sarvam invocation from writing to `pi-mono/`, `.env` files, or credential files. Sensitive path blocking is in the provider, not just the system prompt.

**7. RPC mode** (`modes/rpc/rpc-mode.ts`). Pi can run as a long-lived JSON-RPC daemon, accepting `prompt` commands and streaming events. This is the mechanically correct interface for production multi-turn use without subprocess spawning overhead. Currently unused by Shoshin.

---

## Open questions for Sarat + Claude

1. **Session threading decision**: Should Shoshin pass `--session $id --print` (Pi owns the JSONL) or keep `--no-session --print` (Shoshin owns the transcript)? The current approach (Shoshin-owned transcript) has one advantage: the transcript is human-readable, independently auditable, and survives Pi upgrades that change session format. The Pi-session approach has one advantage: zero token growth (no history re-send). Which failure mode is more acceptable in production?

2. **RPC mode adoption**: `--mode rpc` keeps a Pi process alive as a JSON-RPC daemon, which eliminates subprocess-spawn cost per turn. However, it requires Shoshin to own a long-lived process per "conversation". In the current Shoshin architecture (dispatch per ticket, stateless orchestrator), this would require a process pool. Is that the right direction, or does the per-ticket isolation model have explicit value?

3. **`shouldForceSynthesis` thresholds**: The current limits (read-only: 2, mutation: 4, RLM state: 8) were chosen empirically. Are these the right defaults for the Shoshin coding-agent use case, where the builder role may legitimately need more tool reads before synthesizing?

4. **sarvam-provider is a local extension, not an npm package**: It is loaded via `-e /abs/path/to/sarvam-provider/index.ts` at dispatch time. This means every Pi subprocess re-transpiles (or re-evaluates) it at startup. Is it worth publishing it as a compiled package, or is startup time not a bottleneck?

5. **`DEFAULT_MUTATION_ROOT`**: `sarvam-provider/index.ts` line 26 has `const DEFAULT_MUTATION_ROOT = "experiments/002-tool-loop-smoke/fixture/"`. This is a development fixture path, not a production default. In production, every Shoshin dispatch should set `SARVAM_PI_MUTATION_ROOT` to the actual project scope path. Is this currently happening? `dispatch.ts` passes `plan.envOverrides` (line 87) — the `envelopeForRole` / `toPiPlan` pipeline needs to be confirmed as setting this env var.

6. **Cost tracking**: `AssistantMessage.usage` carries `{input, output, cacheRead, cacheWrite, totalTokens, cost}`. The sarvam-provider sets `input`/`output`/`totalTokens` from the API response but leaves `cost` at `0` (lines 556–559, 598–601) because Sarvam pricing is `0` in the model config. If Sarvam introduces billing, this will silently underreport. Should the provider compute cost from a configurable rate?

---

## Self-critique

**Files not read or partially read**: `core/agent-session.ts` is ~2500 lines; I read it in three chunks covering lines 0–120, 120–320, 320–520, 520–720, 720–900, 900–1100, and 2390–2510. Lines 1100–2390 (the compaction subsystem, navigateTree, reload, extension binding, bash execution, scoped model cycling) were not read. The compaction mechanics in `core/compaction/` (five files) were not inspected. These are relevant to the "context overflow" gap item — my description of auto-compaction is based on the event types and the grep output, not direct code reading.

**`modes/rpc/rpc-types.ts` not read**: The RPC protocol schema (command types, response shapes) was not inspected. My description of RPC mode is based on `rpc-mode.ts` lines 0–80 only.

**`packages/sarvam-subagent-extension/index.ts` not read**: This extension adds `rlm_*` tools (the `STATE_TOOL_RESULT_LIMIT = 8` in sarvam-provider suggests these exist). Their schema and behavior were not inspected.

**Assumptions made**:
- The `--session` + `--print` combination works as implied by the arg parser. It has not been smoke-tested in this session.
- `DEFAULT_MUTATION_ROOT` being a fixture path is assumed to be a dev artifact, not intentional. The team should verify `toPiPlan()` sets `SARVAM_PI_MUTATION_ROOT` correctly in production dispatches.
- Tool retry (gap item) is described as "not present in the agent loop" — this is correct based on `agent-loop.ts` reading, but the extension `beforeToolCall`/`afterToolCall` hooks could theoretically implement it at the extension layer.
