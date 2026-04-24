# Experiment Log

## 2026-04-24

Initialized clean outer repo scaffold in `C:/Projects/sarvam-pi`.

Known starting state:

- `pi-mono/` exists as an ignored upstream reference clone.
- Pi custom provider docs support `pi.registerProvider()`.
- Pi provider config supports `headers`, `apiKey`, `api: "openai-completions"`, and per-model compatibility flags.
- OpenCode Sarvam confirms the working auth shape: `SARVAM_API_KEY` injected only as `api-subscription-key`, not `Authorization: Bearer`.
- The Pi provider sketch now uses a custom Sarvam fetch adapter for Experiment 001 to avoid the stock OpenAI SDK bearer-auth path.

Next step:

Run Experiment 001 after confirming Sarvam endpoint, model ID, and local `SARVAM_API_KEY` availability.

### Provider Smoke Result

Passed: Sarvam responded through Pi with exact `api-subscription-key` auth after replacing the stock OpenAI-compatible bearer-auth path with a custom adapter.

Passed: Sarvam used Pi's `read` tool to inspect `README.md` and then produced a correct project summary. This verifies the first end-to-end loop: user prompt -> Sarvam tool decision -> Pi tool execution -> Sarvam synthesis.

Observed first tool-loop mismatch:

- Sarvam emitted a text/XML-style call: `<tool_call>read ... <arg_key>file_path</arg_key>`.
- Pi expects a structured `toolCall` event and built-in read expects `path`.
- Added a temporary provider-level bridge that parses Sarvam's XML-ish tool call and normalizes `file_path`/`filePath` to `path` for Pi read/search/list tools.
- Follow-up after a tool result failed with `Tool messages found but no tools provided`; Sarvam requires the `tools` schema to be present whenever tool calls or tool messages are in history.
- Added OpenAI-style `tools` conversion from Pi's active tool definitions on every request with tools available.
- With tools available, Sarvam first responded in prose: `We need to read README file... Use read tool.` Added a provider-level tool protocol prompt that asks for exactly one XML-ish `<tool_call>` and `path` arguments when a tool is needed.
- After sending real tool schemas, Sarvam may return native OpenAI-style `message.tool_calls` instead of XML-ish text. Added native `tool_calls` parsing and an explicit error when Sarvam returns neither text nor tool calls.
- Read-only test showed a tool loop: Sarvam successfully read requested docs, then repeatedly re-read `README.md` instead of synthesizing. Added a provider loop guard that forces `tool_choice: "none"` after repeated reads or four tool results since the last user turn.
- Follow-up test showed malformed tool names (`tool`, `tool_name`) after successful reads. Strengthened synthesis guard: read-only sessions close tool use after two tool results, flatten tool history into plain text, omit tool schemas, and reject unavailable tool names visibly.
- Sarvam then returned another `read` call even after synthesis was required. Added a one-shot synthesis retry: if tools are closed and Sarvam still emits a tool call, resend flattened history with a stricter final-answer instruction and no tools.
- Synthesis retry still produced `toolName`, so the retry now uses a clean transcript with only the original user request and retrieved content. If Sarvam still emits a tool call, the provider suppresses it and returns a harness note instead of failing the turn.
- When asking Sarvam to explain the tool bridge, the final answer may quote `<tool_call>` examples from `TOOL_PROTOCOL.md`. The synthesis retry now treats XML-ish tool-call text as prose and only suppresses native tool calls.
- Before mutation smoke, added provider-level mutation guards: edit/write are scoped to `experiments/002-tool-loop-smoke/fixture/` by default and sensitive paths such as `pi-mono/`, env files, secrets, and credentials are blocked.
- Mutation smoke passed: Sarvam read `experiments/002-tool-loop-smoke/fixture/agent-notes.md`, edited the TODO line, read the file again to verify, and summarized the exact change. Latency was reported as excellent.
- RLM smoke loaded the state tools and successfully created a session plus trajectory event, but the read-only synthesis guard closed tools before the remaining state writes. Raised the synthesis limit to eight tool results when `rlm_*` tools are active.
- RLM smoke passed after the guard adjustment. Sarvam created session `0c3ef84a-6c54-4c4a-8320-1dd1632fae37`, appended trajectory, wrote and read context, wrote compaction, appended a planned `scout` child call using `sarvam/sarvam-105b`, and synthesized the final state summary.
- First subagent smoke launched `sarvam_subagent` but the child timed out after 120 seconds. Patched the subagent wrapper to use `--no-session --print`, ignore stdin, use a stricter child protocol, default to 240 seconds, and return partial output on timeout.
- Subagent smoke passed after hardening. Root Sarvam created session `d85302ab-9c37-487d-8b91-1bdc2ed4c457`, launched a Sarvam 105B `scout` child process, received a provider responsibility summary, and recorded running/completed child-call records in RLM state.

Next step:

Retry read-only tools, then replace this temporary bridge with a more principled Sarvam tool protocol adapter or custom tool schemas.
