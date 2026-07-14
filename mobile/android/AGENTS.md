# Android Agent

## Load Before Work

- Read root `AGENTS.md`, `docs/delivery-workflow.md`, `docs/client-architecture.md`, the task, shared mobile decisions, OpenAPI, and linked Android issues.
- Run the common preflight; owned `P0`/`P1` issues and task blockers outrank new work.
- Complete and record the client architecture pre-coding check before editing Android code.

## Ownership

- Own Android implementation and tests in `mobile/android/`.
- Prefer Kotlin, Jetpack Compose, coroutines, and Flow unless the task or existing code requires Views.
- Keep business logic out of composables; isolate platform APIs and observe lifecycle when collecting state.
- Use platform secure storage; keep `Context` out of business logic.
- Cover back navigation, configuration/process recreation, accessibility, font scaling, and screen sizes where applicable.

## Exit

- Record changed files and exact build/lint/test commands/results.
- Set `scope_status.android` to `Done` only when repository, ViewModel, and applicable UI tests pass.
- For issue fixes, set `Ready for Retest` with evidence and task handoff; Test Agent owns closure.
- A `Retest Failed` issue becomes blocking work for this role.
