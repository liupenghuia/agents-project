---
id: TASK-20260715-015
title: 后端域模块化与契约同步重构
status: Done
priority: P1
owner: Test Agent
created: "2026-07-15"
updated: "2026-07-15"
source_idea: null
depends_on:
  - TASK-20260715-014
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

# 任务：后端域模块化与契约同步重构

## Origin

- Source idea: `None` — 内部架构质量重构，不引入新产品能力。
- Decision: 按架构评估五项建议，由 Architect Agent 主导，外部 HTTP 行为与数据语义保持兼容。

## Goal

在不改变对外可观察行为的前提下，提升可维护性与健壮性：域模块拆分、统一公开可见性策略、协作写路径事务、契约同步、小程序请求状态机复用。

## Scope

1. 拆分 `backend/src/app.js` / `db.js` 为域模块，保留 `createApp` / `createDatabase` 入口兼容。
2. 同步 `docs/openapi.yaml` 与 `docs/database.md` 到最新实现（协作、过期、totalCount、续期等）。
3. 抽出统一公开可见性 / 拉黑 / 过期策略，供 market 与 collaboration 共用。
4. 协作写路径补事务，并增强集成测试。
5. 小程序增加 request-state helper，并补关键页测试，减少 loading/error 复制。

## Non-goals

- 新业务功能、数据库引擎切换、引入 Web 框架、微服务拆分、消息推送。

## Acceptance Criteria

- [x] 既有 `npm test` 与 delivery runner 在无契约变更的情况下保持通过。
- [x] `createApp` / `createDatabase` 导入路径对现有测试与 scripts 兼容。
- [x] OpenAPI 覆盖协作、续期、列表 totalCount、expiresAt 等已实现契约。
- [x] database.md 记录 expires_at 与 collaboration 表。
- [x] 公开可见性策略集中定义，market 与 collaboration 共用。
- [x] 协作关键写路径使用事务；测试覆盖幂等与阻塞路径。
- [x] 小程序 request-state helper 被至少两个关键页使用，并有单元测试。

## Architecture Decision

见 `docs/architecture/adr-007-backend-domain-modules.md`。

## Client Architecture Pre-Coding Check

- Target/module: Mini Program request state helper + market/conversation page orchestration.
- Existing pattern: pages own UI state; `services/api.js` owns transport; utils hold pure helpers.
- Decision: add `utils/request-state.js` pure helper; pages adopt without changing API semantics.
- Shared vs target-specific: helper is Mini Program local (no second consumer yet).
- Security/state: no new server trust; only client loading/error/pending transitions.
- Verification: node unit tests for helper + existing Mini Program suite + backend suite.
- Architecture review: Completed via ADR-007.

## Verification Evidence

- `cd backend && npm test` → 16 passed
- Mini Program tests including `tests/request-state.test.js` → passed
- `ruby scripts/validate_workflow.rb` → passed (after scope Done)
- `ruby scripts/deliver.rb backend-modular-refactor` → see latest report under `/tmp/ppfiles-learn-delivery/TASK-20260715-015/`

## Changed files (summary)

- Backend: `http.js`, `routes/index.js`, `domain/*`, facades `db.js`/`collaboration.js`, thinner `app.js`
- Docs: `adr-007`, `architecture.md`, `openapi.yaml` 0.5.0, `database.md`
- Mini Program: `utils/request-state.js`, tests, `market-detail`/`conversation` adoption

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15 | Architect Agent | Backend / Mini Program | Draft | In Progress | task, ADR-007 | Architecture refactor authorized; external behavior freeze required | None | Implement modules, contracts, helper |
| 2026-07-15 | Architect / Backend / Mini Program | Test Agent | In Progress | Ready for Test | domain modules, http/routes, openapi/database, request-state | Module split + visibility policy + transactions + contract sync + helper | None | Independent acceptance |
| 2026-07-15 | Test Agent | — | Ready for Test | Done | task | backend 16 pass; Mini Program request-state + suite pass; delivery runner re-run after metadata fix | None | Optional further route-domain split |
