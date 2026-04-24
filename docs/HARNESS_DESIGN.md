# Harness Design

## Design Principle

Sarvam should remain the continuous root model: voice, persona, and primary reasoning substrate. The harness should move brittle discipline out of prose prompts and into explicit runtime structure.

## Layers

1. **Provider layer**: Pi extension that registers Sarvam models against an OpenAI-compatible endpoint, with `api-subscription-key` auth and provider compatibility flags.
2. **Tool layer**: Sarvam-tuned replacements or wrappers for file, search, edit, and shell tools. These should normalize Windows paths, prevent workspace escape, preserve empty outputs with sentinels, and return retry instructions when arguments drift.
3. **RLM state layer**: External state store for active context, full history, compaction summaries, branch metadata, and child-call traces.
4. **Runtime layer**: Narrow Asymmetrica Runtime tools exposed only after the tool loop is stable.
5. **Benchmark layer**: Replayable experiment tasks comparing current Ananta paths against the Sarvam Pi harness.

## Pi Integration Notes

Pi supports registering custom providers with `pi.registerProvider()`. For Sarvam, the first pass should use:

```ts
pi.registerProvider("sarvam", {
  baseUrl: process.env.SARVAM_BASE_URL ?? "https://api.sarvam.ai/v1",
  api: "sarvam-chat-completions",
  streamSimple: streamSarvam,
  models: [/* Sarvam model definitions */],
});
```

Open questions to verify in Experiment 001:

- exact Sarvam chat-completions base URL
- canonical model IDs for Sarvam 105B, 30B, and smaller worker candidates
- whether Pi can later use the stock OpenAI SDK path; first smoke uses a Sarvam-specific adapter to avoid accidental `Authorization: Bearer`
- whether streaming tool calls follow OpenAI delta shape closely enough for Pi
- whether `reasoning_content` is returned, and whether it should be mapped to Pi thinking blocks or suppressed
- which Pi `compat` flags are required, especially developer-role support, max-token field, reasoning-effort fields, and tool-result naming

## Experiment Roadmap

### 001 Provider Smoke

Register Sarvam in Pi and test plain text chat with no tools. Log raw request/response shape only after redacting secrets.

Acceptance:

- model appears in Pi model list
- one text-only prompt succeeds
- empty or malformed provider responses are captured with actionable diagnostics
- provider config is documented well enough to repeat

### 002 Tool Loop Smoke

Add a minimal tool set: read, list/grep, shell/test wrapper, and only then write/edit. Start with a harmless coding task in a disposable fixture.

Acceptance:

- no workspace escape on Windows-style or leading-slash paths
- empty stdout does not break the model/tool protocol
- schema drift returns repair guidance
- tool calls can recover after at least one induced bad argument

### 003 RLM State Smoke

Persist root context, raw history, compaction summary, and child-call traces outside prompt context.

Acceptance:

- full JSONL trajectory is recoverable
- compaction summary is separate from raw history
- session can resume after compaction with task continuity

### 004 Asymmetrica Runtime Smoke

Expose one read-only runtime surface first: health check, catalog listing, or a harmless classifier.

Acceptance:

- runtime failures are isolated from the core tool loop
- tool output is compact and typed
- no broad execution surface is exposed

## Safety

The harness is research code until the benchmarks show repeatability. Do not port into Ananta `deepagent` until provider and tool-loop behavior are stable enough to run behind a feature flag.
