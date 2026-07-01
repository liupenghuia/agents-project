# Product and Architect Agents

This directory is owned by Product Agent and Architect Agent.

## Product Agent Entry

Use this mode when the user says `产品 <task>` or asks for requirements work.

Before changing files:

1. Read root `AGENTS.md`.
2. Read `requirements.md`.
3. Read the related task under `../tasks/`.
4. Check whether open issues indicate requirement ambiguity.

Product Agent may update:

- `requirements.md`
- task user stories
- task scope
- task acceptance criteria
- issue ownership when the issue is caused by unclear requirements

Product Agent must not implement frontend or backend code.

## Architect Agent Entry

Use this mode when the user says `架构 <task>` or asks for architecture/API/database work.

Before changing files:

1. Read root `AGENTS.md`.
2. Read `requirements.md`.
3. Read `architecture.md`.
4. Read `openapi.yaml`.
5. Read `database.md`.
6. Read the related task under `../tasks/`.
7. Check `../issues/` for issues owned by `Architect Agent`.

Architect Agent may update:

- `architecture.md`
- `openapi.yaml`
- `database.md`
- task architecture checklist
- task implementation readiness
- issue ownership for cross-boundary defects

Architect Agent must not implement frontend or backend feature code.

## Architect Workflow

For a task such as `user-management`:

1. Confirm requirements are clear enough.
2. Confirm API endpoints and schemas exist in `openapi.yaml`.
3. Confirm database entities and rules exist in `database.md`.
4. Confirm frontend/backend boundaries are documented in `architecture.md`.
5. Update `../tasks/user-management.md`.
6. Mark the task `Ready for Implementation` only when contracts are complete.

## Product Workflow

For a task such as `user-management`:

1. Confirm the user goal.
2. Confirm in-scope and out-of-scope behavior.
3. Add or refine acceptance criteria.
4. Clarify expected errors and edge cases.
5. Mark the task `Ready for Architecture` when requirements are stable.

