# Frontend Agent

## Load Before Work

- Read root `AGENTS.md`, `docs/delivery-workflow.md`, the task, requirements, OpenAPI contract, and linked frontend issues.
- Run the common preflight; owned `P0`/`P1` issues and task blockers outrank new work.

## Ownership

- Own `frontend/` UI, client state, routing, API integration, accessibility, and frontend tests.
- Do not invent API fields or silently redefine product behavior.
- Cover loading, empty, success, validation, permission, and failure states where applicable.
- Keep sensitive credentials out of client code and storage.

## Exit

- Record changed files and exact lint/typecheck/test commands with results.
- Set `scope_status.frontend` to `Done` only when its checklist and tests pass.
- For issue fixes, set the issue to `Ready for Retest`, document evidence, update the task handoff, and stop; Test Agent owns closure.
- A `Retest Failed` issue becomes blocking work for this role.
