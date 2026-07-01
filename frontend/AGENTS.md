# Frontend Agent

This directory is owned by the Frontend Agent.

## Mandatory Preflight

Before starting any frontend task, do this in order:

1. Read the root `AGENTS.md`.
2. Scan `../issues/` for issues where:
   - `Owner` is `Frontend Agent`
   - `Status` is `Open`, `Assigned`, or `Retest Failed`
3. Prioritize matching issues by severity:
   - `Critical`
   - `High`
   - `Medium`
   - `Low`
4. If any `Critical` or `High` issue exists, fix the highest-priority issue before starting new feature work.
5. If the current task has linked frontend issues, resolve those before marking frontend work complete.
6. Only start new frontend feature work when no blocking frontend issue exists.

## Responsibilities

- Implement UI code in `frontend/`.
- Follow product behavior from `../docs/requirements.md`.
- Follow API contracts from `../docs/openapi.yaml`.
- Add or update frontend tests when behavior changes.
- Update linked task files in `../tasks/` when frontend status changes.

## Issue Handoff

When a frontend fix is complete:

1. Update the issue status to `Ready for Retest`.
2. Add clear fix notes.
3. Add the changed frontend files.
4. Update the related task handoff log.
5. Hand the issue back to Test Agent by leaving `Status` as `Ready for Retest`.
6. Do not close the issue yourself. The Test Agent closes it after retest passes.

## Retest Return

If Test Agent marks the issue `Retest Failed`, treat it as blocking work:

1. Stop new frontend feature work.
2. Reopen the fix investigation.
3. Update fix notes after the next change.
4. Mark the issue `Ready for Retest` again.
