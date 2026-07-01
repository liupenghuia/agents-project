# AGENTS

This project uses a closed-loop multi-agent workflow. Each agent owns a clear part of the delivery lifecycle, and handoffs must be documented in project files.

## Directory Contract

```text
.
├── AGENTS.md
├── docs
│   ├── AGENTS.md
│   ├── requirements.md
│   ├── architecture.md
│   ├── openapi.yaml
│   ├── database.md
│   └── testing.md
├── tasks
│   ├── template.md
│   └── user-management.md
├── issues
│   └── template.md
├── tests
│   └── AGENTS.md
├── frontend
│   └── AGENTS.md
└── backend
    └── AGENTS.md
```

## Instruction Loading Rule

Every agent must load instructions before changing files.

- If working in `docs/`, read `docs/AGENTS.md` first, then root `AGENTS.md`.
- If working in `frontend/`, read `frontend/AGENTS.md` first, then root `AGENTS.md`.
- If working in `backend/`, read `backend/AGENTS.md` first, then root `AGENTS.md`.
- If working as Test Agent, read `tests/AGENTS.md` first, then root `AGENTS.md`.
- If working outside a role directory, read root `AGENTS.md`.
- Local role instructions may add stricter rules, but must not weaken the root workflow.

## Short Command Mode

The user may give short commands instead of full role prompts. Expand them using these rules.

| User command | Agent mode | Required behavior |
| --- | --- | --- |
| `产品 <task>` or `product <task>` | Product Agent | Read `docs/AGENTS.md`, root `AGENTS.md`, then update requirements and task acceptance criteria. |
| `架构 <task>` or `architect <task>` | Architect Agent | Read `docs/AGENTS.md`, root `AGENTS.md`, then update architecture, OpenAPI, database docs, and task readiness. |
| `前端 <task>` or `frontend <task>` | Frontend Agent | Read `frontend/AGENTS.md`, root `AGENTS.md`, run preflight issue check, then work on the task if not blocked. |
| `后端 <task>` or `backend <task>` | Backend Agent | Read `backend/AGENTS.md`, root `AGENTS.md`, run preflight issue check, then work on the task if not blocked. |
| `测试 <task>` or `test <task>` | Test Agent | Read `tests/AGENTS.md`, root `AGENTS.md`, retest pending issues first, then test the task. |
| `下一个 前端` or `next frontend` | Frontend Agent | Pick the highest-priority frontend issue first; if none, pick the next frontend task. |
| `下一个 后端` or `next backend` | Backend Agent | Pick the highest-priority backend issue first; if none, pick the next backend task. |
| `下一个 测试` or `next test` | Test Agent | Pick `Ready for Retest` first; if none, pick a `Ready for Test` task. |

If the task name is short, map it to `tasks/<task>.md` when possible. For example, `架构 user-management` means `tasks/user-management.md`.

## Agent Roles

### Product Agent

Owns product clarity.

- Maintains `docs/requirements.md`.
- Defines user stories, scope, priorities, and acceptance criteria.
- Answers requirement questions raised by other agents.
- Decides whether ambiguous behavior is a bug or a requirement change.

### Architect Agent

Owns system shape and technical contracts.

- Maintains `docs/architecture.md`.
- Maintains API boundaries in `docs/openapi.yaml`.
- Maintains data model decisions in `docs/database.md`.
- Reviews feature tasks before implementation starts.
- Resolves frontend/backend ownership disputes when a defect crosses boundaries.

### Backend Agent

Owns backend behavior.

- Implements backend code in `backend/`.
- Keeps implementation aligned with `docs/openapi.yaml`.
- Adds backend unit and integration tests.
- Fixes issues assigned to `Backend Agent`.

### Frontend Agent

Owns user-facing behavior.

- Implements frontend code in `frontend/`.
- Keeps UI behavior aligned with `docs/requirements.md`.
- Integrates with APIs defined in `docs/openapi.yaml`.
- Adds frontend unit, component, and UI integration tests.
- Fixes issues assigned to `Frontend Agent`.

### Test Agent

Owns verification, not feature implementation.

- Maintains `docs/testing.md`.
- Creates test cases from task acceptance criteria.
- Runs frontend, backend, API, and end-to-end tests.
- Creates issue files under `issues/` when tests fail.
- Performs regression testing after fixes.
- Closes issues only after retest passes.

## Closed-Loop Workflow

1. Product Agent writes or updates `docs/requirements.md`.
2. Architect Agent updates `docs/architecture.md`, `docs/openapi.yaml`, and `docs/database.md`.
3. A task is created from `tasks/template.md`.
4. Architect Agent marks the task as `Ready for Implementation`.
5. Backend Agent implements backend scope and updates task status.
6. Frontend Agent implements frontend scope and updates task status.
7. Test Agent executes tests from `docs/testing.md` and the task acceptance criteria.
8. If tests pass, Test Agent marks the task as `Done`.
9. If tests fail, Test Agent creates an issue from `issues/template.md`.
10. The issue is assigned to Product, Architect, Frontend, or Backend.
11. The assigned agent fixes the issue and marks it `Ready for Retest`.
12. Test Agent must pick up `Ready for Retest` issues before new test work.
13. Test Agent retests. If passed, the issue is closed. If failed, the issue becomes `Retest Failed` and returns to the same owner.
14. The task can move forward only after all linked issues are `Closed`.

## Fix-to-Retest Handoff

Frontend Agent and Backend Agent must not close issues they fixed.

When a fix is complete, the fixing agent must:

1. Update the issue status to `Ready for Retest`.
2. Add fix notes explaining what changed.
3. Add changed files or commits when available.
4. Update the related task handoff log.
5. Stop on that issue until Test Agent retests it.

Test Agent must then:

1. Scan for `Ready for Retest` issues before new test work.
2. Rerun the original reproduction steps.
3. Run the relevant automated tests.
4. Set the issue to `Closed` if it passes.
5. Set the issue to `Retest Failed` and return it to the owner if it fails.

## Task Statuses

Use these exact statuses in `tasks/*.md`:

- `Draft`
- `Ready for Architecture`
- `Ready for Implementation`
- `Backend In Progress`
- `Backend Done`
- `Frontend In Progress`
- `Frontend Done`
- `Ready for Test`
- `Test Failed`
- `Fixing`
- `Ready for Retest`
- `Done`

## Issue Statuses

Use these exact statuses in `issues/*.md`:

- `Open`
- `Assigned`
- `Fixing`
- `Ready for Retest`
- `Retest Failed`
- `Retest Passed`
- `Closed`

## Ownership Rules

- Requirement mismatch: assign to `Product Agent`.
- API contract mismatch: assign to `Architect Agent`.
- API implementation bug: assign to `Backend Agent`.
- Database/query bug: assign to `Backend Agent`.
- UI rendering or interaction bug: assign to `Frontend Agent`.
- Frontend API integration bug: assign to `Frontend Agent` unless the backend violates `docs/openapi.yaml`.
- Unclear ownership: assign to `Architect Agent` for triage.

## Quality Gates

A task can be marked `Done` only when:

- Requirements are documented.
- API and database impact are documented.
- Frontend and backend scopes are complete or explicitly marked not applicable.
- Required tests pass.
- All linked issues are `Closed`.
