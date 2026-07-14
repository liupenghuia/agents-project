---
id: TASK-20260714-007
title: 双向收藏模块
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
  - TASK-20260714-006
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
blocked_reason: 双向收藏后端与小程序实现已完成，等待统一执行收藏一致性和失效对象验证。
blocked_since: "2026-07-14"
unblock_owner: Test Agent
unblock_condition: 统一验证双方收藏、幂等、取消、我的收藏和下架后失效提示。
---

# 任务：双向收藏模块

## Origin

- Source idea: `IDEA-20260713-001`
- Promotion decision/evidence: User requires both sides to favorite details and use a dedicated favorites module.

## Goal

让求职者收藏招聘信息、招聘者收藏求职信息，并在各自小程序中查看和管理收藏。

## Scope

In scope:

- 求职者收藏/取消收藏招聘信息。
- 招聘者收藏/取消收藏求职信息。
- 两个方向独立的“我的收藏”列表。
- 收藏状态同步、重复收藏幂等、取消收藏和失效对象提示。

Out of scope:

- 收藏备注、收藏分组、通知、推荐和自动匹配。
- Web、iOS、Android 客户端。

## Acceptance Criteria

- [ ] 求职者可以在招聘详情收藏和取消收藏。
- [ ] 招聘者可以在求职详情收藏和取消收藏。
- [ ] 重复点击收藏不会生成重复记录。
- [ ] 收藏状态在列表、详情和“我的收藏”之间一致。
- [ ] 收藏列表展示 `publishedAt` 和对象当前状态。
- [ ] 下架、删除或不可用对象显示失效提示，不能查看联系方式。
- [ ] 用户只能访问和修改自己的收藏。
- [ ] 未登录或身份不匹配时收藏操作被拒绝。

## Architecture Impact

- Architecture/API/Database: Direction-specific favorite tables and APIs are defined in ADR-003, `docs/database.md`, and `docs/openapi.yaml`.
- Security/privacy: Enforce viewer identity ownership and never include contact data in favorite list responses.
- Rollback: Favorite rows can be removed without changing source information.

## Implementation Checklist

### Backend

- [ ] Implement two favorite list APIs and four idempotent add/remove APIs.
- [ ] Add unique constraints and unavailable-object behavior.
- [ ] Add ownership and authorization tests.

### WeChat Mini Program

- [ ] Add favorite/unfavorite controls to both detail screens.
- [ ] Add two role-specific “我的收藏” screens.
- [ ] Add empty, loading, error, retry, and unavailable states.
- [ ] Add Mini Program flow tests.

### Web / Mobile / iOS / Android

- [ ] `N/A`: Web is not a public user client; mobile clients are deferred.

## Test Plan

- [ ] Add/remove/idempotency for both directions.
- [ ] Cross-user and cross-role access rejection.
- [ ] Disabled target behavior.
- [ ] Favorites list and detail state synchronization.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `docs/requirements.md`, task | Version-one favorite scope recorded | Depends on market browse | Architect defines direction-specific persistence and API |
| 2026-07-14 | Architect Agent | Backend / Mini Program / Test | Ready for Architecture | Blocked | `docs/architecture/adr-003-two-sided-information-market.md`, `docs/database.md`, `docs/openapi.yaml`, task | Favorite persistence and API boundaries defined | Prior market tasks blocked | Unblock dependencies, then implement |
| 2026-07-14 | Backend + Mini Program Agents | Test Agent | Blocked | Blocked | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `frontend/miniprogram/services/api.js`, `frontend/miniprogram/pages/favorites/*`, `frontend/miniprogram/pages/market/*` | Market integration test covers add/list and API syntax checks pass | Unified favorite consistency verification pending | Run the unified validation batch. |
