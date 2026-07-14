---
id: TASK-20260714-009
title: 双向市场地图与区域聚合
status: Blocked
priority: P1
owner: Product Agent
created: "2026-07-14"
updated: "2026-07-14"
source_idea: IDEA-20260714-009
depends_on:
  - TASK-20260714-006
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
blocked_reason: 后端和小程序实现及本地交付 runner 已通过，等待依赖任务统一验证以及微信 DevTools/真机地图渲染、定位授权、缩放聚合和标记交互验收。
blocked_since: "2026-07-14"
unblock_owner: Test Agent
unblock_condition: TASK-20260714-006 和 TASK-20260714-008 完成统一验证，并在微信 DevTools/真机完成双向地图、定位拒绝/重试、缩放聚合、标记详情、下架消失和隐私字段检查。
---

# 任务：双向市场地图与区域聚合

## Goal

让已审核求职者和招聘者在对应角色地图上查看对方有效发布信息；地图与卡片列表使用一致的数据和筛选规则。

## Scope

In scope:

- 求职者查看招聘信息地图，招聘者查看求职信息地图。
- 地图标记、点击详情、缩放、区域聚合和聚合数量。
- 地图与卡片列表筛选、发布时间、状态和详情跳转一致。
- 区域级坐标/聚合中心点下发，不返回原始经纬度和楼栋地址。
- 加载、空、错误、重试、无权限和无更多状态。

Out of scope:

- 路线规划、实时定位、自动匹配、推荐和普通用户 Web/移动端。

## Acceptance Criteria

- [ ] 已审核双方可以进入对应地图 Tab，未登录或身份不匹配被拒绝。
- [ ] 地图和卡片列表显示同一批有效信息、发布时间和筛选状态。
- [ ] 缩放会在单点和区域聚合之间切换，聚合点显示数量并可继续放大。
- [ ] 点击单点或聚合点后可以进入对应详情。
- [ ] 地图响应不包含原始经纬度、精确地址或联系方式；详情继续遵守联系方式权限。
- [ ] 下架、打回和不可用信息不会作为正常公开点展示，并能按状态筛选。
- [ ] 小程序覆盖加载、空、错误、重试和地图权限失败状态。

## Architecture Impact

- Architecture/API/Database: 采用后端隐私投影和确定性网格聚合，不新增地图数据源表；详细决策见 `docs/architecture/adr-004-market-map-projection.md`。
- API: 新增 `GET /market/recruitment-posts/map` 和 `GET /market/job-seeking-information/map`，必须提供 `south/west/north/east/zoom`，返回点/聚合 DTO。
- Security/privacy: 原始坐标仅用于服务端查询和拥有者接口，公共地图只返回网格中心/区域展示点；联系方式和精确地址不进入地图响应。
- External dependency: 微信 `map` 组件负责渲染，生产环境需要配置合法地图能力和密钥；后端不绑定具体地图供应商。
- Migration: 无新增源数据表；沿用现有坐标字段和市场状态，未来可增加空间索引而不改变 DTO。
- Rollback: 地图 Tab 可关闭，卡片列表和详情继续可用；地图查询可通过 feature flag 停用。

## Client Architecture Pre-Coding Check

- Target/module: Mini Program market map/list state and API environment/session behavior.
- Existing pattern and owner: Market page owns UI orchestration; `utils/market-map.js` owns pure projection mapping; `services/api.js` owns transport; `app.js` owns sessions.
- Responsibility and dependency decision: Preserve those owners, centralize environment URL/session-expiry handling in data/session modules, and keep map platform APIs in the page adapter boundary.
- Shared vs target-specific decision: Map rendering and location permission remain WeChat-specific; bounds/filter contracts remain OpenAPI-owned.
- State/contract/security impact: No endpoint shape change; stale responses and invalid sessions fail safely and retry through a fresh session.
- Verification plan: API/session/map utility tests, Mini Program syntax, backend integration and delivery runner.
- Architecture review: Not required; this is a local hardening of ADR-004 boundaries.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `ideas/map-location-tags.md`, `docs/requirements.md`, task | Product scope, privacy defaults, acceptance criteria and dependencies recorded | Map provider and aggregation strategy unknown | Architect defines API, privacy projection and map implementation boundary |
| 2026-07-14 | Architect Agent | Test Agent / Backend / Mini Program | Ready for Architecture | Blocked | `docs/architecture.md`, `docs/architecture/adr-004-market-map-projection.md`, `docs/database.md`, `docs/openapi.yaml`, task | Architecture gate: modular monolith reuse, bounded viewport API, deterministic grid aggregation, privacy projection, rollback and external dependency documented; `ruby scripts/validate_workflow.rb`: Passed; OpenAPI YAML parsed | Prior market and safety tasks remain blocked on unified validation | Test Agent validates dependencies; then Backend and Mini Program implement the stable map contract |
| 2026-07-14 | Backend + Mini Program Agents | Test Agent | Blocked | Blocked | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `frontend/miniprogram/services/api.js`, `frontend/miniprogram/utils/market-map.js`, `frontend/miniprogram/pages/market/*`, `frontend/miniprogram/tests/market-map.test.js` | `npm test`: 9 passed; all Mini Program JS syntax passed; registration/information/map tests passed; `ruby scripts/deliver.rb map-market-view`: Passed, report `/tmp/ppfiles-learn-delivery/TASK-20260714-009/20260714-153426-3839bd/report.md` | WeChat DevTools/real-device map rendering and dependency acceptance remain | Test Agent runs unified platform verification and records acceptance evidence |
| 2026-07-14 | Review Agent | Test Agent | Blocked | Blocked | Map/list shared filters, non-paginated viewport response, Mini Program stale-request handling and market tests | Backend `npm test`: 11 passed; Mini Program market tests passed; delivery report `/tmp/ppfiles-learn-delivery/TASK-20260714-009/20260714-181440-a2f973/report.md` | WeChat DevTools/real-device map rendering, positioning, clustering and privacy checks pending | Execute the documented platform map acceptance run. |
