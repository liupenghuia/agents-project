# Delivery Workflow

## Idea State Machine

| Status | Set by | Exit condition | Next |
| --- | --- | --- | --- |
| `Captured` | Product | Raw idea and decision owner recorded | `Discovering`, `Rejected` |
| `Discovering` | Product | Discovery loop executed with evidence labels | `Ready for Review`, `Parked`, `Rejected` |
| `Ready for Review` | Product | Product Brief Ready Gate passes | `Approved`, `Parked`, `Rejected`, `Discovering` |
| `Approved` | Decision owner | MVP decision recorded | `Promoted`, `Discovering` |
| `Parked` | Decision owner | Revisit trigger recorded | `Discovering`, `Rejected` |
| `Rejected` | Decision owner | Reason recorded | Terminal |
| `Promoted` | Product | Requirements and bidirectionally linked tasks created | Terminal |

Follow `docs/product-discovery.md`. Product Agent must distinguish facts, assumptions, and unknowns; only the recorded decision owner may approve, park, or reject an idea.

## Preflight

1. Load the role instructions, root instructions, task, source documents, and linked issues.
2. Run `ruby scripts/validate_workflow.rb` before changing delivery state.
3. Pick work by `P0` to `P3`, then oldest `created` date. `Ready for Retest` comes before new work at equal priority.
4. Do not start a new feature when the role owns a `P0`/`P1` issue or the task has an unresolved blocking issue.
5. Confirm dependencies are `Done`; otherwise set the task to `Blocked` and document the unblock condition.

## Frontend Target State

Frontend has an aggregate `scope_status.frontend` plus independent target metadata:

```yaml
frontend_targets:
  miniprogram: true
  web: false
frontend_target_status:
  miniprogram: Pending
  web: N/A
```

- `frontend_targets` selects required delivery targets; a false target must remain `N/A`.
- `frontend_target_status` is owned by the target Agent. `小程序` updates only `miniprogram`; `Web` updates only `web`.
- `前端` coordinates cross-target work and sets aggregate frontend `Done` only after every required target is `Done` and evidenced.
- Each target handoff records changed files, exact commands/results, issues, and next action in the task and `frontend/HISTORY.md`.
- A target may be implemented in parallel only after the API/requirements contract is stable; cross-target behavior changes require a coordinator handoff.

## Task State Machine

| Status | Set by | Entry condition | Next |
| --- | --- | --- | --- |
| `Draft` | Product | Task created | `Ready for Architecture`, `Blocked`, `Cancelled` |
| `Ready for Architecture` | Product | Product gate passes | `Ready for Implementation`, `Blocked` |
| `Ready for Implementation` | Architect | Architecture gate passes | `In Progress`, `Blocked` |
| `In Progress` | Implementation owner | At least one required scope started | `Ready for Test`, `Blocked` |
| `Blocked` | Any role | Blocker and unblock condition recorded | Previous eligible state, `Cancelled` |
| `Ready for Test` | Last implementation owner | All required implementation scopes are `Done` | `Test Failed`, `Ready for Release`, `Done` |
| `Test Failed` | Test | Issue created and linked | `Ready for Retest`, `Blocked` |
| `Ready for Retest` | Fix owner | All linked fixes await independent retest | `Test Failed`, `Ready for Release`, `Done` |
| `Ready for Release` | Test | Test gate passes and release is required | `Released`, `Blocked` |
| `Released` | Orchestrator or authorized operator | Release evidence recorded | `Done`, `Blocked` |
| `Done` | Test or authorized release operator | Definition of Done passes | Terminal |
| `Cancelled` | Product | Reason recorded | Terminal |

Scope values are `N/A`, `Pending`, `In Progress`, `Blocked`, or `Done`. Overall status never replaces `scope_status`; parallel owners update only their scope.

## Issue State Machine

| Status | Set by | Required evidence |
| --- | --- | --- |
| `Open` | Test | Reproduction, expected/actual behavior, owner, severity |
| `Assigned` | Triage owner | Confirmed owner and routing reason |
| `Fixing` | Fix owner | Investigation or implementation started |
| `Ready for Retest` | Fix owner | Fix notes, changed files, verification command/result |
| `Retest Failed` | Test | Reproduction and failure evidence from retest |
| `Closed` | Test | Original reproduction and relevant automated tests pass |

Severity is `P0` production/security/data-loss impact, `P1` core flow blocked, `P2` degraded non-core behavior, or `P3` minor impact.

## Entry And Exit Gates

### Product Gate

- A source idea is `Approved` or `Promoted`, or the task records why no discovery brief is needed.
- Goal, users, priority, in/out scope, assumptions, and dependencies are explicit.
- Acceptance criteria are observable and include errors, empty states, permissions, and applicable non-functional requirements.
- Required delivery scopes are set in task front matter; non-applicable scopes are `N/A`.

### Architecture Gate

- Architecture, API, database, security, migration, compatibility, and rollback impacts are documented or explicitly `None`.
- Ownership boundaries, error behavior, and external dependencies are resolved.
- Breaking contract changes include a versioning and consumer migration decision.

### Implementation Gate

- Every required scope is `Done`; code, tests, documentation, and generated contracts agree.
- Changed files and exact verification commands/results are recorded in the task.
- Every required frontend target is `Done` with a matching history entry.
- No required check is skipped without a blocker.

### Test Gate

- Every acceptance criterion has pass/fail evidence.
- Required unit, integration, contract, UI, and end-to-end checks pass as applicable.
- All linked issues are `Closed`; regression coverage is recorded.

### Release Gate

- If `release_required: false`, Test may move a passing task directly to `Done`.
- Otherwise record environment, artifact/version, deployment command or run, smoke test, monitoring, and rollback readiness.
- Production release requires explicit approval unless the user already authorized that release in the current request.

## Blockers And Recovery

- Record `blocked_reason`, `blocked_since`, `unblock_owner`, and `unblock_condition` in task front matter.
- Retry a transient command at most twice after the original failure; record all attempts. Then mark `Blocked` if no safe alternative exists.
- On resume, rerun preflight and the last failed gate. Do not restart completed phases.
- Concurrent agents must not overwrite another scope's status or handoff rows; re-read shared files immediately before editing.

## Change Control

- Changed acceptance criteria return the task to `Ready for Architecture` and require Product handoff notes.
- Changed API/database contracts after implementation starts require Architect impact review and affected scopes return to `Pending`.
- New scope requires updated estimates/dependencies, tests, and explicit Product ownership.
- Adding or removing a frontend target returns affected target statuses to `Pending` and requires a coordinator handoff.
- Every transition appends date, actor, from/to status, evidence, and next action to the handoff log.

## Definition Of Done

- Product, architecture, implementation, test, and applicable release gates pass.
- Required scopes are `Done`; excluded scopes are `N/A`.
- Linked issues are `Closed`; dependencies are `Done`.
- `ruby scripts/validate_workflow.rb` passes.
- Known limitations and follow-up work are documented rather than hidden.

## Local Delivery Runner

`ruby scripts/deliver.rb <task>` is the repository-level execution entry point for the reversible local loop. It must:

1. Validate workflow metadata before feature checks.
2. Read the task's required scopes and frontend targets.
3. Run the applicable backend, Mini Program, Web, and service health checks.
4. Store exact commands, outputs, and service logs under `/tmp/ppfiles-learn-delivery/<task-id>/`.
5. Stop with failed evidence when no repair command is configured.
6. When `DELIVERY_REPAIR_COMMAND` is configured, run the repair command with `DELIVERY_TASK`, `DELIVERY_ROUND`, and `DELIVERY_RUN_DIR`, then repeat checks.
7. Stop after the configured maximum rounds; never report a passing task from an assumed or skipped check.

Runner failure handling follows the issue state machine: Test Agent records an actionable failure under `issues/`, the owning role fixes it and marks it `Ready for Retest`, and Test Agent independently retests it. The runner may provide failure evidence and invoke the configured repair command, but it does not close issues or bypass task status gates.

The runner does not bypass human approval for production deployment, secrets, destructive changes, or real WeChat authorization. Platform-specific Mini Program checks remain explicit manual or DevTools gates.
