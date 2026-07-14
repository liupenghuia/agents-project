# Frontend Web Agent

## Load Before Work

- Read parent `frontend/AGENTS.md`, then root `AGENTS.md`.
- Read `docs/delivery-workflow.md`, `docs/client-architecture.md`, the task, requirements, OpenAPI, and linked Web issues.
- Run preflight and verify `frontend_targets.web: true` before starting feature work.
- Complete and record the client architecture pre-coding check before editing Web code.

## Ownership

- Own `frontend/web/` for browser UI, client state, routing, API integration, reviewer operations, and Web tests.
- Follow the existing Web framework and TypeScript conventions when they exist; do not introduce a second stack.
- Keep business rules out of presentation code and route all network calls through the shared API boundary.

## Web Standards

- Use semantic HTML, keyboard navigation, visible focus, accessible labels, responsive layouts, and useful empty/loading/error states.
- Protect authenticated routes and reviewer operations server-side; client guards are UX only.
- Never put tokens, secrets, or reviewer credentials in source, URLs, local storage, or logs unless the approved security design explicitly allows it.
- Handle session expiry, permission failures, retries, duplicate submissions, and destructive actions deliberately.
- Keep reviewer tools separate from public user flows and display review status/reasons without implying real-name verification.

## Exit And History

- Run the closest Web build, lint, typecheck, and test commands; record exact commands and results.
- Set `scope_status.frontend_web` to `Done` only after the target checklist passes.
- Append target, changed files, commands/results, issues, and next action to the task handoff and `frontend/HISTORY.md`.
- For fixes, set the issue to `Ready for Retest`; Test Agent owns closure.
