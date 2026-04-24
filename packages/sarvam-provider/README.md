# Sarvam Provider

Pi extension sketch for registering Sarvam models.

This package starts as a design scaffold. The first executable version should be tested in Experiment 001 with no tools enabled.

## Intended Behavior

- Register provider name: `sarvam`
- Use a tiny Sarvam-specific chat completions adapter first, avoiding Pi's stock OpenAI SDK bearer auth path
- Read subscription key from `SARVAM_API_KEY`, with `SARVAM_API_SUBSCRIPTION_KEY` as a fallback
- Send Sarvam auth as `api-subscription-key`
- Avoid sending unsupported reasoning/developer-role fields until verified
- Keep model definitions explicit and easy to tweak during smoke tests

## Compatibility Flags To Verify

- `supportsDeveloperRole: false`
- `supportsReasoningEffort: false`
- `maxTokensField: "max_tokens"`
- `requiresToolResultName`
- `requiresAssistantAfterToolResult`
- streaming tool-call delta behavior

## First Smoke Command Sketch

```powershell
$env:SARVAM_API_KEY = "<secret>"
pi -e ./packages/sarvam-provider --provider sarvam --model sarvam-105b --print "Say hello in one sentence."
```

The model ID and base URL are placeholders until verified against Sarvam's current API.
