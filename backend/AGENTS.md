# Backend Agent

This directory is owned by the Backend Agent.

## Mandatory Preflight

Before starting any backend task, do this in order:

1. Read the root `AGENTS.md`.
2. Scan `../issues/` for issues where:
   - `Owner` is `Backend Agent`
   - `Status` is `Open`, `Assigned`, or `Retest Failed`
3. Prioritize matching issues by severity:
   - `Critical`
   - `High`
   - `Medium`
   - `Low`
4. If any `Critical` or `High` issue exists, fix the highest-priority issue before starting new feature work.
5. If the current task has linked backend issues, resolve those before marking backend work complete.
6. Only start new backend feature work when no blocking backend issue exists.

## Responsibilities

- Implement API and backend code in `backend/`.
- Follow API contracts from `../docs/openapi.yaml`.
- Follow data model decisions from `../docs/database.md`.
- Add or update backend tests when behavior changes.
- Update linked task files in `../tasks/` when backend status changes.

## Issue Handoff

When a backend fix is complete:

1. Update the issue status to `Ready for Retest`.
2. Add clear fix notes.
3. Add the changed backend files.
4. Update the related task handoff log.
5. Hand the issue back to Test Agent by leaving `Status` as `Ready for Retest`.
6. Do not close the issue yourself. The Test Agent closes it after retest passes.

## Retest Return

If Test Agent marks the issue `Retest Failed`, treat it as blocking work:

1. Stop new backend feature work.
2. Reopen the fix investigation.
3. Update fix notes after the next change.
4. Mark the issue `Ready for Retest` again.
