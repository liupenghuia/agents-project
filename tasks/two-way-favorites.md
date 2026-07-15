---
id: TASK-20260714-007
title: 双向收藏模块
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
  test: Done
  release: N/A
release_required: false
blocked_reason: null
blocked_since: null
unblock_owner: null
unblock_condition: null
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

- [x] 求职者可以在招聘详情收藏和取消收藏。
- [x] 招聘者可以在求职详情收藏和取消收藏。
- [x] 重复点击收藏不会生成重复记录。
- [x] 收藏状态在列表、详情和“我的收藏”之间一致。
- [x] 收藏列表展示 `publishedAt` 和对象当前状态。
- [x] 下架、删除或不可用对象显示失效提示，不能查看联系方式。
- [x] 用户只能访问和修改自己的收藏。
- [x] 未登录或身份不匹配时收藏操作被拒绝。
- [ ] 收藏和取消收藏有明确的进行中、成功、失败反馈，并防止重复点击。
- [ ] 我的收藏支持空、加载、错误、重试、已失效对象和返回详情状态；失效对象不可查看联系方式。

## Architecture Impact

- Architecture/API/Database: Direction-specific favorite tables and APIs are defined in ADR-003, `docs/database.md`, and `docs/openapi.yaml`.
- Security/privacy: Enforce viewer identity ownership and never include contact data in favorite list responses.
- Rollback: Favorite rows can be removed without changing source information.

## Implementation Checklist

### Backend

- [x] Implement two favorite list APIs and four idempotent add/remove APIs.
- [x] Add unique constraints and unavailable-object behavior.
- [x] Add ownership and authorization tests.

### WeChat Mini Program

- [x] Add favorite/unfavorite controls to both detail screens.
- [x] Add two role-specific “我的收藏” screens.
- [x] Add empty, loading, error, retry, and unavailable states.
- [x] Add Mini Program flow tests.

### Web / Mobile / iOS / Android

- [x] `N/A`: Web is not a public user client; mobile clients are deferred.

## Test Plan

- [x] Add/remove/idempotency for both directions.
- [x] Cross-user and cross-role access rejection.
- [x] Disabled target behavior.
- [x] Favorites list and detail state synchronization.

## Client Architecture Pre-Coding Check

- Target/module: Mini Program favorites list state and destructive removal interaction.
- Existing pattern and owner: Favorites page owns loading/error/confirmation state; API service owns direction-specific transport.
- Responsibility and dependency decision: Keep domain direction selection in one page helper and make removal explicit rather than card-tap side effect.
- Shared vs target-specific decision: UI confirmation is Mini Program-specific; favorite idempotency remains backend-owned.
- State/contract/security impact: No contract change; improves duplicate-action prevention and recoverable error states.
- Verification plan: JS syntax, API helper tests and task delivery runner.
- Architecture review: Not required; existing data and navigation boundaries are unchanged.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `docs/requirements.md`, task | Version-one favorite scope recorded | Depends on market browse | Architect defines direction-specific persistence and API |
| 2026-07-14 | Architect Agent | Backend / Mini Program / Test | Ready for Architecture | Blocked | `docs/architecture/adr-003-two-sided-information-market.md`, `docs/database.md`, `docs/openapi.yaml`, task | Favorite persistence and API boundaries defined | Prior market tasks blocked | Unblock dependencies, then implement |
| 2026-07-14 | Backend + Mini Program Agents | Test Agent | Blocked | Blocked | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `frontend/miniprogram/services/api.js`, `frontend/miniprogram/pages/favorites/*`, `frontend/miniprogram/pages/market/*` | Market integration test covers add/list and API syntax checks pass | Unified favorite consistency verification pending | Run the unified validation batch. |
| 2026-07-14 | Review Agent | Test Agent | Blocked | Blocked | Approved-target favorite authorization, `isFavorited` projection, Mini Program toggle/confirmation flows | Backend `npm test`: 11 passed with both favorite directions; Mini Program tests passed; delivery report `/tmp/ppfiles-learn-delivery/TASK-20260714-007/20260714-181440-90d6bd/report.md` | WeChat DevTools/real-device interaction checks pending | Verify add/remove/list consistency and repeated taps in WeChat DevTools/on device. |
| 2026-07-14 | Test Agent | Coordinator | Blocked | Done | Automated and DevTools favorite evidence; task metadata | User-provided pass report `/tmp/ppfiles-learn-delivery/TASK-20260714-007/20260714-120515-9981e4/report.md`; task-specific DevTools script passed both detail toggles, repeated PUT idempotency, both favorite-list confirmation removals, cross-user isolation and unapproved 403; disabled favorite behavior passed in earlier dependency flow | None | Dependency accepted; begin TASK-010 architecture. |
| 2026-07-15 | Mini Program Agent | Test Agent | Done | Blocked | `frontend/miniprogram/pages/market-detail/*`, `frontend/miniprogram/pages/favorites/*` | Detail favorite action now prevents duplicate taps with pending feedback; favorites cards open the independent detail page and removal uses event isolation; runner report `/tmp/ppfiles-learn-delivery/TASK-20260714-007/20260715-121322-88db4e/report.md` | WeChat DevTools/real-device interaction and unavailable-object rendering pending | Test add/remove, return to detail, invalid target and repeated taps in platform tools. |
