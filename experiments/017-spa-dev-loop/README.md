# Experiment 017 - SPA Dev Loop

Dogfood test for the full user-to-dev loop:

1. create a fresh Shoshin fixture
2. import a plain-language web-app spec
3. add a scoped feature
4. run Architect -> Builder through Pi/Sarvam
5. verify that `app/index.html` exists and contains basic SPA behavior

Run:

```powershell
node experiments/017-spa-dev-loop/smoke.mjs
```

With `SARVAM_API_KEY` set, this performs the live Builder run and leaves the generated artifact at:

```text
experiments/017-spa-dev-loop/fixture/app/index.html
```

Observed first-pass edge, 2026-04-25: the agent produced a functional single-file app and persisted Pi sessions correctly, but the visual styling defaulted to a generic purple-gradient/card treatment. That is useful dogfood signal for the next quality gate: domain-appropriate UI review before user-facing DONE.
