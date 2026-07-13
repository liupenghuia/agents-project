# Mobile Agent

## Load Before Work

- Read root `AGENTS.md`, `docs/delivery-workflow.md`, the task, requirements, OpenAPI, and linked mobile issues.
- Run the common preflight; owned `P0`/`P1` issues and task blockers outrank new work.

## Ownership

- Own shared mobile behavior in `mobile/` outside `ios/` and `android/`.
- Keep business rules, API mapping, navigation state, caching, and cross-platform app state shared where practical.
- Model loading, empty, content, validation, offline, timeout, auth-expired, retry, and cancellation states where applicable.
- Use a small client layer; do not bind UI directly to transport objects or store secrets in plain text.
- Keep navigation and state transitions explicit, single-directional, accessible, and testable.

## Exit

- Record changed files and exact verification commands/results.
- Set `scope_status.mobile` to `Done` only when parsing, state, navigation, and error-flow tests pass.
- For issue fixes, set `Ready for Retest` with evidence and task handoff; Test Agent owns closure.
- A `Retest Failed` issue becomes blocking work for this role.
