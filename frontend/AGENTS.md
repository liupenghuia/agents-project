# Frontend Agent Coordinator

## Load Before Work

- Read `frontend/miniprogram/AGENTS.md` or `frontend/web/AGENTS.md` for the target, then root `AGENTS.md`.
- Read `docs/delivery-workflow.md`, `docs/client-architecture.md`, the task, requirements, OpenAPI, and linked frontend issues.
- Run the common preflight; owned `P0`/`P1` issues and task blockers outrank new work.

## Scope Routing

| Target | Directory | Agent | Task metadata |
| --- | --- | --- | --- |
| WeChat Mini Program | `frontend/miniprogram/` | Frontend MiniProgram Agent | `frontend_targets.miniprogram` |
| Web, including reviewer operations | `frontend/web/` | Frontend Web Agent | `frontend_targets.web` |

`前端 <task>` coordinates both targets and owns aggregate `scope_status.frontend`. `小程序 <task>` and `Web <task>` update only their target status.

## Shared Ownership

- Keep UI behavior aligned with `docs/requirements.md` and transport shapes aligned with `docs/openapi.yaml`.
- Consume **Designer Agent** output (`scope_status.design`, task Design Spec, `docs/design/`) before substantial UI work when design is required; do not invent a second visual system.
- Coordinate shared API client, error taxonomy, accessibility expectations, and cross-target changes; visual system changes go through Designer or an explicit design note.
- Do not let one target silently change the other target's behavior; record a handoff and update the task first.
- The aggregate frontend scope is `Done` only when every required target is `Done` and its evidence is recorded; when design is required it must also be `Done`.

## Preflight And Handoff

- Scan issues owned by `Frontend Agent`, `Frontend MiniProgram Agent`, or `Frontend Web Agent` (and design-related issues owned by `Designer Agent` when blocking UI).
- Fix target-specific `P0`/`P1` issues before new feature work.
- **Hard gate:** do not start feature UI coding until task is `Ready for Implementation` (Product Done + Architecture Done + Design Done when UI is required). If design is still open, run or await `设计 <task>` first.
- Complete the client architecture pre-coding check for every affected target; resolve Architect review triggers before implementation and record the result in the task.
- Each handoff records target, changed files, exact commands/results, related issues, and next action in the task log and `frontend/HISTORY.md`.
- Fix owners set issues to `Ready for Retest`; Test Agent closes them.

## Exit

- Re-read shared task metadata before editing to avoid overwriting another target.
- Set only the target status you own; the coordinator updates aggregate frontend status after both target gates pass.
- A `Retest Failed` issue blocks the affected target.
