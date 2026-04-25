# Pi mono local patches

`pi-mono/` is an upstream clone, not source owned by this repo. Shoshin can still
depend on small Pi changes during the sprint, but those changes are tracked here
as patch files so the integration is reproducible without committing to upstream
`main` directly.

Apply from the repo root:

```sh
git -C pi-mono apply ../patches/pi-mono/0001-print-session-telemetry.patch
npm --prefix pi-mono/packages/coding-agent run build
```

Current patch:

- `0001-print-session-telemetry.patch` - adds `sessionFile` to print-mode JSON
  headers and emits final `print_result` plus `session_summary` JSON events.
