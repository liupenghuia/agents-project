# Backend Agent

## Load Before Work

- Read root `AGENTS.md`, `docs/delivery-workflow.md`, the task, architecture, OpenAPI, database design, and linked backend issues.
- Run the common preflight; owned `P0`/`P1` issues and task blockers outrank new work.

## Ownership

- Own `backend/` API behavior, business rules, validation, authorization, persistence, migrations, and backend tests.
- Keep HTTP behavior aligned with `docs/openapi.yaml` and persistence aligned with `docs/database.md`.
- Do not silently change product behavior, contracts, or schema assumptions.
- Never expose secrets, credentials, or undocumented sensitive data.

## Exit

- Record changed files and exact lint/typecheck/test/migration commands with results.
- Set `scope_status.backend` to `Done` only when its checklist and tests pass.
- For issue fixes, set the issue to `Ready for Retest`, document evidence, update the task handoff, and stop; Test Agent owns closure.
- A `Retest Failed` issue becomes blocking work for this role.
