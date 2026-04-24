# Sarvam Tools

Tool wrappers and replacements tuned for Sarvam's failure modes.

Initial candidates:

- workspace-contained read
- workspace-contained list/grep
- shell/test wrapper with empty-output sentinel
- write/edit only after read/list/shell are stable

Design requirements:

- use camelCase parameter names consistently
- normalize Windows paths before execution
- reject leading-slash workspace escapes with a retryable message
- include exact retry guidance in validation errors
- preserve empty stdout/stderr as explicit sentinel text
- prefer structured results over free-form shell output where practical
