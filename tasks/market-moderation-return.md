---
id: TASK-20260714-011
title: 市场信息管理员打回与状态运营
status: Done
priority: P1
owner: Test Agent
created: "2026-07-14"
updated: "2026-07-14"
source_idea: IDEA-20260714-009
depends_on:
  - TASK-20260714-008
linked_issues: []
required_scopes:
  backend: true
  frontend: true
  mobile: false
  ios: false
  android: false
frontend_targets:
  miniprogram: true
  web: true
frontend_target_status:
  miniprogram: Done
  web: Done
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

# 任务：市场信息管理员打回与状态运营

## Goal

让管理员可以对招聘/求职信息执行打回、下架和恢复处理；发布者和浏览者在地图、列表、收藏中看到明确一致的状态。

## Scope

In scope:

- Web 管理后台查看市场信息和状态。
- 管理员打回并填写原因；发布者可看到原因和修改入口。
- 打回信息从正常公开地图/列表中排除，支持状态筛选。
- 发布者重新提交后回到待审核/待处理状态，审核通过后恢复公开。
- 管理员下架、恢复、举报处理和审计记录。
- 小程序地图、卡片、详情和“我的发布”展示状态、原因、成功/失败/重试。

Out of scope:

- 自动审核、智能风控、申诉、通知和复杂运营报表。

## Acceptance Criteria

- [x] 管理员可按角色、状态、发布时间查看市场信息。
- [x] 管理员打回必须填写原因，操作人和时间进入审计记录。
- [x] 打回信息在发布者地图/卡片/我的发布中有明显状态和原因。
- [x] 打回信息不作为普通公开地图点和卡片展示，状态筛选可以找到。
- [x] 发布者可修改并重新提交，审核通过后恢复公开。
- [x] 非管理员、普通管理员越权、非拥有者操作均被拒绝。
- [x] 管理员下架和恢复后，地图、列表、详情、收藏状态一致。

## Architecture Impact

- API/Database: ADR-005 defines the shared `published`, `pending_review`, `changes_requested`, and `disabled` state machine, current moderation fields, admin list/decision APIs, and append-only audit ownership.
- Security/privacy: Only active `owner` and `operator` admin roles may moderate content; reasons remain owner/admin-only and public projections remain published-only.
- Compatibility: Existing and new content continues to publish immediately until explicitly returned; existing list, detail, media, map, favorite, report, and owner API paths remain compatible.
- Migration: SQLite source tables are rebuilt transactionally only when old status constraints require widening; nullable moderation fields preserve existing rows.
- Rollback: Non-published content remains private if moderation UI/endpoints are disabled; source content and audit history are retained.

## Implementation Checklist

### Backend

- [x] Migrate both market content tables and return owner moderation metadata.
- [x] Add filtered administrator content list and atomic moderation transitions.
- [x] Enforce owner/operator permissions and append audit entries.
- [x] Keep public list, detail, map, media, contacts, and favorites status-consistent.

### Web

- [x] Add a permission-gated content operations module with type/status/time filters.
- [x] Add approve, request changes, disable, and restore interactions with loading/error confirmation states.
- [x] Show status, publication time, moderation reason, and empty/error/retry states.

### WeChat Mini Program

- [x] Show owner status and reason in applicant information and recruiter publication cards/editors.
- [x] Turn returned-content edits into explicit resubmission and show pending/disabled outcomes.
- [x] Keep market, map, detail, favorites, contact, and unavailable states consistent.

## Test Plan

- [x] Backend transition matrix, reason validation, audit, role authorization, and owner isolation.
- [x] Public and owner projections for returned, pending, disabled, approved, and restored content.
- [x] Web filter/action/error/permission tests.
- [x] Mini Program returned-content edit/resubmit and status rendering tests.
- [x] DevTools and delivery-runner regression over map, cards, details, favorites, report, disable, and restore.

## Client Architecture Pre-Coding Check

- Targets/modules: Web administrator content operations; Mini Program applicant editor, recruitment-post editor, and recruiter publication workspace.
- Existing owners: Web `request` owns transport and module panels own view state; Mini Program owner pages own forms/actions, `role-home` owns publication navigation, and `services/api.js` owns transport.
- Responsibility/dependency decision: Backend owns all transition and authorization rules. Clients render server states and submit named decisions; they do not infer legal transitions.
- Shared vs target-specific: Status vocabulary and DTOs are shared through OpenAPI. Web filtering/decision dialogs and Mini Program owner banners/resubmission messaging remain target-specific.
- Security/state impact: Web navigation guards are UX only; backend requires `owner`/`operator`. Mini Program only reads and edits content belonging to its authenticated role profile.
- Verification plan: Backend integration tests, Web permission/DOM behavior tests, Mini Program utility/page syntax tests, DevTools runtime flows, and repository delivery runner.
- Architecture review: Completed in ADR-005; implementation must return for review if it introduces automatic pre-publication review, a second state source, or client-owned transition rules.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect / Web / Mini Program | Draft | Ready for Architecture | `ideas/map-location-tags.md`, `docs/requirements.md`, task | 打回、状态筛选、原因、恢复和权限验收标准已定义 | 打回状态枚举和审核角色映射待架构确认 | Architect defines state machine and admin/user API boundaries |
| 2026-07-14 | Architect Agent | Backend / Web / Mini Program / Test | Ready for Architecture | Ready for Implementation | `docs/architecture/adr-005-market-content-moderation.md`, `docs/architecture.md`, `docs/database.md`, `docs/openapi.yaml`, task | OpenAPI YAML parsed; `ruby scripts/validate_workflow.rb`: passed; client pre-coding check recorded | None | Implement backend contract first, then both clients against the stable API. |
| 2026-07-14 | Backend Agent | Frontend / Test | Ready for Implementation | In Progress | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `backend/test/market-migration.test.js`, `backend/README.md` | `npm test`: 13 passed; backend JS syntax passed; old-schema migration, transition, permission, visibility and audit tests passed | None | Web and Mini Program consume stable moderation contract. |
| 2026-07-14 | Web + Mini Program Agents | Test Agent | In Progress | Ready for Test | Web content operations/permissions/tests; Mini Program owner status utility and applicant/recruitment/workspace pages; `frontend/HISTORY.md` | Web syntax plus moderation/permission tests passed; all Mini Program JS syntax and seven test files passed; OpenAPI parsed; workflow and `git diff --check` passed | None | Run delivery runner plus browser and WeChat DevTools transition regression. |
| 2026-07-14 | Test Agent | Test Agent | Ready for Test | Blocked | Automated, runner and platform evidence; task metadata | Backend 13 tests passed; Web syntax/unit tests passed; Mini Program seven test files passed; runner `/tmp/ppfiles-learn-delivery/TASK-20260714-011/20260714-192533-a17a55/report.md`; DevTools return/resubmit/approve/disable/restore passed with screenshots `/tmp/task-011-recruitment-returned.png` and `/tmp/task-011-applicant-returned.png`; browser discovery returned no instances; isolated Web fixtures seeded for all four statuses and owner/operator/admin/reviewer roles | Web real-browser interaction/rendering not executed | Open `http://127.0.0.1:4173`, complete the documented Web actions, then resume Test Gate; do not start serial TASK-010 first. |
| 2026-07-14 | User + Test Agent | Coordinator | Blocked | Done | Web manual acceptance evidence and task metadata | User confirmed Web verification passed for content filters, decisions and role navigation; all prior backend, Web unit, runner and DevTools evidence remains passing; `ruby scripts/validate_workflow.rb` passed before transition | None | Begin serial dependency closure for TASK-010. |
