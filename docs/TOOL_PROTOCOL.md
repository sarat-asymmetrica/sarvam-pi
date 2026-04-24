# Sarvam Tool Protocol

## Purpose

Sarvam can work inside Pi, but the harness must translate between Sarvam's observed tool dialects and Pi's stricter tool event protocol.

This document records the contract used by `packages/sarvam-provider`.

## Auth

Sarvam authentication must use:

```text
api-subscription-key: <SARVAM_API_KEY>
```

Do not rely on `Authorization: Bearer` for Sarvam. The provider uses a custom fetch adapter rather than Pi's stock OpenAI SDK path so headers remain exact.

## Accepted Model Outputs

The provider accepts two tool-call dialects.

### Native OpenAI-Style Tool Calls

Preferred when Sarvam returns `message.tool_calls`:

```json
{
  "tool_calls": [
    {
      "id": "call_...",
      "type": "function",
      "function": {
        "name": "read",
        "arguments": "{\"path\":\"README.md\"}"
      }
    }
  ]
}
```

### XML-ish Fallback

Observed from Sarvam before native parsing was enabled:

```text
<tool_call>read
<arg_key>path</arg_key>
<arg_value>README.md</arg_value>
</tool_call>
```

The provider parses this and emits a structured Pi `toolCall` event.

## Argument Normalization

The provider normalizes common argument drift before handing calls to Pi tools.

| Observed | Pi argument |
| --- | --- |
| `file_path` | `path` |
| `filePath` | `path` |
| `filepath` | `path` |
| `old_string` | `oldText` |
| `new_string` | `newText` |
| `oldString` | `oldText` |
| `newString` | `newText` |
| `cmd` | `command` |

For Pi's `edit` tool, legacy single replacement arguments are converted to:

```json
{
  "path": "file.txt",
  "edits": [{ "oldText": "before", "newText": "after" }]
}
```

## Request Rules

When tools are active, every request includes the active tool schemas. Sarvam rejects follow-up requests containing tool history unless the `tools` array is present.

The provider also injects a small tool-protocol prompt only when tools are active. This prompt tells Sarvam to emit one tool call instead of prose when it needs a tool.

## Diagnostics

The provider should fail loudly when:

- Sarvam returns HTTP errors.
- Sarvam returns neither text nor tool calls.
- Sarvam returns invalid JSON for native tool-call arguments.

Silent blank turns are harness bugs.
