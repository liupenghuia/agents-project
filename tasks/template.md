---
id: TASK-YYYYMMDD-NNN
title: Feature name
status: Draft
priority: P2
owner: Product Agent
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_idea: null
depends_on: []
linked_issues: []
required_scopes:
  backend: false
  frontend: false
  mobile: false
  ios: false
  android: false
frontend_targets:
  miniprogram: false
  web: false
frontend_target_status:
  miniprogram: N/A
  web: N/A
scope_status:
  product: In Progress
  architecture: Pending
  design: N/A
  backend: N/A
  frontend: N/A
  mobile: N/A
  ios: N/A
  android: N/A
  test: Pending
  release: N/A
release_required: false
blocked_reason: null
blocked_since: null
unblock_owner: null
unblock_condition: null
---

# Task: Feature Name

## Origin

- Source idea: `IDEA-YYYYMMDD-NNN`, or `None` with the reason discovery is not required.
- Promotion decision/evidence:

## Goal

Describe the observable user or business outcome.

## Users And Assumptions

- Primary user:
- Assumptions:
- External dependencies:

## Scope

In scope:

-

Out of scope:

-

## User Stories

- As a ..., I want ..., so that ...

## Acceptance Criteria

- [ ] Given ..., when ..., then ...
- [ ] Error, empty, loading, and permission behavior is observable where applicable.
- [ ] Applicable security, reliability, performance, accessibility, and compatibility requirements pass.

## Architecture Impact

- Architecture:
- API:
- Database/migration:
- Security/privacy:
- Compatibility/versioning:
- Rollback:

Use `None` with a reason when an area is not affected.

## Design Spec

Required when `scope_status.design` is not `N/A`. Owned by Designer Agent (`设计 <task>`). Use `N/A` with reason when the task has no client UI.

### Design Goal

- User problem:
- Desired experience outcome:

### User Flow And Decisions

1.
2.

Primary decision per key screen:

### Information Architecture

- Primary content:
- Secondary / progressive disclosure:
- Buried in sheet or “更多”:

### Key Screens / Components

| Screen | Purpose | Primary CTA | States to design |
| --- | --- | --- | --- |
|  |  |  | loading / empty / error / success |

### Visual And Interaction Notes

- Tokens / patterns to reuse (`docs/design/README.md`):
- Mini Program / Web / App differences:
- Explicit non-goals:

### Design Handoff

- Implementing targets:
- Open questions:

## Client Architecture Pre-Coding Check

Complete one row per selected Frontend, Mini Program, Web, shared Mobile, iOS, or Android target before implementation. Use `N/A` when the task has no client scope.

| Target/module | Existing pattern and owner | Responsibility/dependency decision | Shared vs target-specific | State/contract/security impact | Verification plan | Architecture review |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  | Not required (reason) / Required (link) |

## Implementation Checklist

### Design

- [ ] Work or `N/A` reason:
- [ ] Design Spec complete and handed to implementing targets:

### Backend

- [ ] Work or `N/A` reason:
- [ ] Tests:

### Frontend Coordination

- [ ] Work or `N/A` reason:
- [ ] Aggregate frontend status and cross-target decision:

### WeChat Mini Program

- [ ] Work or `N/A` reason:
- [ ] UI states and tests:

### Web

- [ ] Work or `N/A` reason:
- [ ] UI states and tests:

### Shared Mobile

- [ ] Work or `N/A` reason:
- [ ] Tests and app states:

### iOS

- [ ] Work or `N/A` reason:
- [ ] Tests and platform behavior:

### Android

- [ ] Work or `N/A` reason:
- [ ] Tests and platform behavior:

## Test Plan

- [ ] Unit:
- [ ] Integration/contract:
- [ ] UI/end-to-end:
- [ ] Regression:

## Verification Evidence

| Date | Scope | Command/check | Result | Evidence |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## Release Plan

- Environment/artifact:
- Deployment and smoke test:
- Monitoring and rollback:

## Known Limitations

- None

## Runtime Observability

When the user requests delivery / multi-role orchestration, record the agent run here (events live under `.agent-runs/`):

| Run ID | Mode | Status | Timeline command |
| --- | --- | --- | --- |
|  | delivery / manual |  | `ruby scripts/agent_run.rb timeline <run_id>` |

Handoff rows below are the human projection; process truth for reconstruction is `events.jsonl`. Dual-write with:

```bash
ruby scripts/agent_run.rb handoff --run <run_id> \
  --from "Product Agent" --to "Architect Agent" \
  --from-status Draft --to-status "Ready for Architecture" \
  --evidence "..." --next "..."
```

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |
