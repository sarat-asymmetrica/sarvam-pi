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

Next step:

Retry read-only tools, then replace this temporary bridge with a more principled Sarvam tool protocol adapter or custom tool schemas.
