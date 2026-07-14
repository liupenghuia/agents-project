---
id: TASK-20260714-008
title: 市场信息生命周期与安全运营
status: Blocked
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
  test: Blocked
  release: N/A
release_required: false
blocked_reason: 生命周期、安全运营后端与小程序举报能力已完成，等待统一执行权限、举报和下架验证。
blocked_since: "2026-07-14"
unblock_owner: Test Agent
unblock_condition: 统一验证发布时间、用户/管理员下架、举报、联系方式频控和审计结果。
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

- [ ] 新发布的招聘信息和求职信息都有 `publishedAt`。
- [ ] 用户可以下架自己的信息，其他用户不能下架。
- [ ] 用户可以提交举报，举报内容有状态和创建时间。
- [ ] 联系方式详情访问会写入日志并受频率限制。
- [ ] 下架信息不出现在市场列表，详情不返回联系方式。
- [ ] 管理员 API 可以查看举报并下架对应市场信息。
- [ ] 举报和下架操作有权限校验和审计信息。
- [ ] 小程序提供举报、成功、失败和重试状态。

## Architecture Impact

- Architecture/API/Database: Lifecycle, reports, contact logs, and protected admin operations are defined in ADR-003, `docs/database.md`, and `docs/openapi.yaml`.
- Security/privacy: Contact is mandatory in detail but restricted to approved authenticated counterpart identities; exact addresses remain private.
- Rollback: Disable state is reversible by authorized owner/admin operation; report records are retained.

## Implementation Checklist

### Backend

- [ ] Add publication timestamps/status transitions.
- [ ] Implement owner disable and report APIs.
- [ ] Implement protected admin report operations and disable action.
- [ ] Add contact access logs, rate limit, and audit tests.

### WeChat Mini Program

- [ ] Add publish time and unavailable states to cards/details.
- [ ] Add report action and confirmation/error/retry states.
- [ ] Add owner disable action where the owner manages their own published information.

### Web / Mobile / iOS / Android

- [ ] `N/A`: No public Web/mobile client in this task; admin Web UI is a later task.

## Test Plan

- [ ] Publish time presence and ordering.
- [ ] Owner/admin disable and unauthorized disable rejection.
- [ ] Report creation and admin resolution.
- [ ] Contact access authorization, logging, and rate limit.
- [ ] Disabled-object list/detail behavior.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `docs/requirements.md`, task | Version-one lifecycle and safety scope recorded | Depends on information tasks | Architect defines state, report, contact, and admin API |
| 2026-07-14 | Architect Agent | Backend / Mini Program / Test | Ready for Architecture | Blocked | `docs/architecture/adr-003-two-sided-information-market.md`, `docs/database.md`, `docs/openapi.yaml`, task | Lifecycle, publish time, report, contact log, and protected admin API defined | Prior information tasks blocked | Unblock dependencies, then implement |
| 2026-07-14 | Backend + Web + Mini Program Agents | Test Agent | Blocked | Blocked | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `frontend/web/index.html`, `frontend/web/app.js`, `frontend/miniprogram/pages/market/*` | Market integration test covers report and admin disable; Web JS syntax and workflow validation pass | Unified permission, report, contact-rate and platform verification pending | Run the unified validation batch. |
