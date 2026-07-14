---
id: TASK-20260714-008
title: 市场信息生命周期与安全运营
status: Done
priority: P1
owner: Architect Agent
created: "2026-07-14"
updated: "2026-07-14"
source_idea: IDEA-20260713-001
depends_on:
  - TASK-20260714-003
  - TASK-20260714-004
  - TASK-20260714-005
linked_issues: []
required_scopes:
  backend: true
  frontend: true
  mobile: false
  ios: false
  android: false
frontend_targets:
  miniprogram: true
  web: false
frontend_target_status:
  miniprogram: Done
  web: N/A
scope_status:
  product: Done
  architecture: Done
  backend: Done
  frontend: Done
  mobile: N/A
  ios: N/A
  android: N/A
  test: Done
  release: N/A
release_required: false
blocked_reason: null
blocked_since: null
unblock_owner: null
unblock_condition: null
---

# 任务：市场信息生命周期与安全运营

## Origin

- Source idea: `IDEA-20260713-001`
- Promotion decision/evidence: User accepted first-version disable, report, contact access logging, and mandatory detail contacts.

## Goal

为市场信息提供发布时间、发布/下架状态、举报和联系方式访问保护，确保管理员可以处理违规信息。

## Scope

In scope:

- 招聘信息和求职信息必须保存 `publishedAt`。
- 用户可以下架自己的已发布信息。
- 用户可以举报招聘信息或求职信息。
- 后端记录联系方式详情访问。
- 后端对联系方式访问做基础频率限制。
- 管理员通过受保护 API 查看和处理举报、下架内容。
- 下架内容从公开列表消失且不能展示联系方式。

Out of scope:

- 完整 Web 运营界面，本任务只提供后端管理 API和小程序举报入口。
- 自动内容审核、智能风控、通知和申诉流程。

## Acceptance Criteria

- [x] 新发布的招聘信息和求职信息都有 `publishedAt`。
- [x] 用户可以下架自己的信息，其他用户不能下架。
- [x] 用户可以提交举报，举报内容有状态和创建时间。
- [x] 联系方式详情访问会写入日志并受频率限制。
- [x] 下架信息不出现在市场列表，详情不返回联系方式。
- [x] 管理员 API 可以查看举报并下架对应市场信息。
- [x] 举报和下架操作有权限校验和审计信息。
- [x] 小程序提供举报、成功、失败和重试状态。

## Architecture Impact

- Architecture/API/Database: Lifecycle, reports, contact logs, and protected admin operations are defined in ADR-003, `docs/database.md`, and `docs/openapi.yaml`.
- Security/privacy: Contact is mandatory in detail but restricted to approved authenticated counterpart identities; exact addresses remain private.
- Rollback: Disable state is reversible by authorized owner/admin operation; report records are retained.

## Implementation Checklist

### Backend

- [x] Add publication timestamps/status transitions.
- [x] Implement owner disable and report APIs.
- [x] Implement protected admin report operations and disable action.
- [x] Add contact access logs, rate limit, and audit tests.

### WeChat Mini Program

- [x] Add publish time and unavailable states to cards/details.
- [x] Add report action and confirmation/error/retry states.
- [x] Add owner disable action where the owner manages their own published information.

### Web / Mobile / iOS / Android

- [x] `N/A`: No public Web/mobile client in this task; admin Web UI is a later task.

## Test Plan

- [x] Publish time presence and ordering.
- [x] Owner/admin disable and unauthorized disable rejection.
- [x] Report creation and admin resolution.
- [x] Contact access authorization, logging, and rate limit.
- [x] Disabled-object list/detail behavior.

## Client Architecture Pre-Coding Check

- Target/module: Mini Program applicant information, recruitment-post editor, recruiter role workspace, and existing Web report operations.
- Existing pattern and owner: Owner pages hold form/action state, role-home owns publication navigation, `services/api.js` owns transport, and backend owns lifecycle authorization.
- Responsibility and dependency decision: Add owner disable orchestration to the existing owner pages and expose owned recruitment posts from role-home; do not duplicate lifecycle rules in presentation code.
- Shared vs target-specific decision: Status semantics remain OpenAPI/backend-owned; confirmation, loading, success, error, and navigation are Mini Program-specific.
- State/contract/security impact: Reuses existing disable endpoints; no contract or schema change. Disabled records remain owner-editable and can be republished by a valid save.
- Verification plan: Backend authorization/contact-rate integration tests, Mini Program syntax/unit tests, DevTools owner-disable/list/favorite runtime flow, and delivery runner.
- Architecture review: Not required; existing owner, data, and navigation boundaries are reused without changing contracts.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `docs/requirements.md`, task | Version-one lifecycle and safety scope recorded | Depends on information tasks | Architect defines state, report, contact, and admin API |
| 2026-07-14 | Architect Agent | Backend / Mini Program / Test | Ready for Architecture | Blocked | `docs/architecture/adr-003-two-sided-information-market.md`, `docs/database.md`, `docs/openapi.yaml`, task | Lifecycle, publish time, report, contact log, and protected admin API defined | Prior information tasks blocked | Unblock dependencies, then implement |
| 2026-07-14 | Backend + Web + Mini Program Agents | Test Agent | Blocked | Blocked | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `frontend/web/index.html`, `frontend/web/app.js`, `frontend/miniprogram/pages/market/*` | Market integration test covers report and admin disable; Web JS syntax and workflow validation pass | Unified permission, report, contact-rate and platform verification pending | Run the unified validation batch. |
| 2026-07-14 | Review Agent | Test Agent | Blocked | Blocked | Published-target report authorization, atomic resolution/audit, Web report controls, OpenAPI | Backend `npm test`: 11 passed; Web permission tests passed; delivery report `/tmp/ppfiles-learn-delivery/TASK-20260714-008/20260714-181439-b9bfc7/report.md` | In-app browser and WeChat platform checks pending | Verify report reject/disable, contact limits, and post-disable disappearance in real clients. |
| 2026-07-14 | Test Agent | Backend / Mini Program | Blocked | In Progress | Task pre-coding check and DevTools/API dependency evidence | DevTools two-way list/detail/favorite/report flow passed; map API changed from 1 visible item to 0 after disable; audit entry present | Owner disable UI and explicit contact-rate/cross-owner regression gaps found | Implement missing acceptance coverage, then rerun Test Gate. |
| 2026-07-14 | Backend + Mini Program Agents | Test Agent | In Progress | Ready for Test | `backend/test/app.test.js`, `frontend/miniprogram/services/api.js`, `pages/applicant-information/*`, `pages/recruitment-post/*`, `pages/role-home/*` | Backend `npm test`: 11 passed; all Mini Program JS syntax and six test files passed | None | Test Agent reruns original permission, report, contact-rate, disable, and unavailable-object scenarios. |
| 2026-07-14 | Test Agent | Coordinator | Ready for Test | Blocked | Automated and DevTools evidence; delivery report | This task's owner publication list, both owner disable confirmations, two-way list/detail/favorite/report, map visibility and audit checks passed; runner report `/tmp/ppfiles-learn-delivery/TASK-20260714-008/20260714-184243-27f7aa/report.md` | Workflow validation found dependencies TASK-003/004/005 are not Done | Complete dependency DevTools gates, then transition this task to Done without repeating passed checks. |
| 2026-07-14 | Test Agent | Coordinator | Blocked | Done | Task metadata and dependency evidence | TASK-003/004/005 are Done; `ruby scripts/validate_workflow.rb`: passed before transition; task Test Gate report `/tmp/ppfiles-learn-delivery/TASK-20260714-008/20260714-184243-27f7aa/report.md` | None | Dependency accepted; begin TASK-011 architecture. |
