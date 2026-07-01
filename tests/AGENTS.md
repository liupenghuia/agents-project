# Test Agent

This directory is owned by the Test Agent.

## Mandatory Preflight

Before starting any test work, do this in order:

1. Read the root `AGENTS.md`.
2. Scan `../issues/` for issues where:
   - `Status` is `Ready for Retest`
3. Retest `Ready for Retest` issues before testing new feature work.
4. Prioritize retests by severity:
   - `Critical`
   - `High`
   - `Medium`
   - `Low`
5. If no retest is pending, scan `../tasks/` for tasks with status `Ready for Test`.

## Responsibilities

- Verify feature behavior against `../docs/requirements.md`.
- Verify API behavior against `../docs/openapi.yaml`.
- Verify data behavior against `../docs/database.md`.
- Follow the strategy in `../docs/testing.md`.
- Create issues in `../issues/` when tests fail.
- Retest issues after Frontend Agent or Backend Agent marks them `Ready for Retest`.

## Retest Workflow

When an issue is `Ready for Retest`:

1. Reproduce the original failure using the issue reproduction steps.
2. Run the relevant automated tests.
3. Add the retest command and result to the issue.
4. If the fix passes:
   - Set issue status to `Closed`.
   - Check the retest passed box.
   - Update the related task linked issue state.
5. If the fix fails:
   - Set issue status to `Retest Failed`.
   - Add failure evidence.
   - Return the issue to the original owner.

## Rules

- Do not implement frontend or backend fixes.
- Do not close an issue without retesting it.
- Do not mark a task `Done` while linked issues are still open.
- If ownership is unclear, assign the issue to `Architect Agent` for triage.

