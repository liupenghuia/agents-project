---
id: TASK-20260714-006
title: 双向信息市场列表与详情
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

# 任务：双向信息市场列表与详情

## Origin

- Source idea: `IDEA-20260713-001`
- Promotion decision/evidence: User requested reciprocal lists, detail pages, required contacts, and publication time for version one.

## Goal

让已审核的应聘者浏览招聘信息，让已审核的招聘者浏览求职信息；双方可进入详情查看完整信息和联系方式。

## Scope

In scope:

- 求职者浏览已发布招聘信息。
- 招聘者浏览已发布求职信息。
- 列表卡片、筛选、游标分页、最新发布排序。
- 招聘信息和求职信息详情页。
- 列表和详情必须展示 `publishedAt`。
- 详情必须展示联系方式；列表不得展示联系方式。
- 列表和详情的空、加载、失败、重试、无更多数据状态。

Out of scope:

- 自动匹配、推荐、聊天、投递、面试、通知和移动端客户端。
- 精确楼栋地址公开。

## Acceptance Criteria

- [x] 已审核应聘身份可以浏览已发布招聘信息列表。
- [x] 已审核招人身份可以浏览已发布求职信息列表。
- [x] 未登录或没有对应已审核身份时，不能访问对应市场列表和详情。
- [x] 列表支持工种、薪资、结算方式、位置等适用筛选条件。
- [x] 列表默认按 `publishedAt` 从新到旧排序，并支持游标分页。
- [x] 列表卡片展示安全摘要和 `publishedAt`，不展示联系方式。
- [x] 详情展示完整允许字段、`publishedAt` 和联系方式。
- [x] 详情不公开精确楼栋地址、内部用户 ID、微信 provider 信息或会话信息。
- [x] 禁用或不存在的信息不出现在列表，详情不能继续展示联系方式。
- [x] 小程序覆盖空、加载、错误、重试、分页和无权限状态。

## Architecture Impact

- Architecture/API/Database: Defined in `docs/architecture.md`, ADR-003, `docs/openapi.yaml`, and `docs/database.md`.
- Security/privacy: Approved counterpart identity required; contact detail reads are logged and rate-limited.
- Rollback: Disable market records and remove them from queries without deleting source identities.

## Implementation Checklist

### Backend

- [x] Implement two market list APIs and two detail APIs.
- [x] Add published status/time filtering and cursor pagination.
- [x] Add safe summary/detail DTOs and contact access logging.
- [x] Add ownership, approved-identity, disabled-content, and privacy tests.

### WeChat Mini Program

- [x] Add applicant recruitment list/detail screens.
- [x] Add recruiter applicant list/detail screens.
- [x] Add filters, pagination, contact display, empty/error/retry states.
- [x] Add navigation from both role workspaces.
- [x] Add Mini Program flow tests.

### Web / Mobile / iOS / Android

- [x] `N/A`: Web is not a public user client; mobile clients are deferred.

## Test Plan

- [x] Both role directions, authentication, and approved-identity access.
- [x] Filters, cursor pagination, newest ordering, and `publishedAt`.
- [x] Contact appears only in detail responses.
- [x] Disabled records disappear and cannot expose contact details.
- [x] Mini Program list/detail states.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `docs/requirements.md`, `ideas/recruitment-platform.md`, task | Product version-one scope recorded | Depends on prior information tasks | Architect defines shared market contracts |
| 2026-07-14 | Architect Agent | Backend / Mini Program / Test | Ready for Architecture | Blocked | `docs/architecture.md`, `docs/architecture/adr-003-two-sided-information-market.md`, `docs/database.md`, `docs/openapi.yaml`, task | Market list/detail contracts, publication time, contact access, and privacy rules defined | Prior information tasks blocked on DevTools | Unblock dependencies, then implement |
| 2026-07-14 | Backend + Mini Program Agents | Test Agent | Blocked | Blocked | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `frontend/miniprogram/services/api.js`, `frontend/miniprogram/pages/market/*`, `frontend/miniprogram/pages/role-home/*` | `npm test`: 9 passed; Mini Program JS syntax and registration/information tests passed; workflow validation passed | Unified platform verification pending | Run the unified validation batch. |
| 2026-07-14 | Review Agent | Test Agent | Blocked | Blocked | Stable market cursors/DTOs/public images, Mini Program list pagination/detail media, OpenAPI | Backend `npm test`: 11 passed including tie-safe two-way cursor pages and contact DTOs; Mini Program market-list/map tests passed; delivery report `/tmp/ppfiles-learn-delivery/TASK-20260714-006/20260714-181439-d24ba4/report.md` | WeChat DevTools/real-device list/detail/media checks pending | Run two-way list pagination and detail rendering in WeChat DevTools/on device. |
| 2026-07-14 | Test Agent | Coordinator | Blocked | Done | Existing automated and DevTools evidence; task metadata | User-provided pass report `/tmp/ppfiles-learn-delivery/TASK-20260714-006/20260714-120515-69824b/report.md`; later DevTools dependency flow verified both list/detail/contact directions, filters, disabled disappearance and screenshots; backend 13-test regression passed | None | Dependency accepted for TASK-007. |
