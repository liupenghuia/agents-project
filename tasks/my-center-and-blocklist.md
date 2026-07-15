---
id: TASK-20260714-010
title: 小程序三 Tab 我的中心与拉黑
status: In Progress
priority: P1
owner: Architect Agent
created: "2026-07-14"
updated: "2026-07-15"
source_idea: IDEA-20260714-009
depends_on:
  - TASK-20260714-007
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
  miniprogram: Pending
  web: N/A
scope_status:
  product: Done
  architecture: Done
  backend: In Progress
  frontend: In Progress
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

# 任务：小程序三 Tab 我的中心与拉黑

## Goal

建立地图、卡片列表、我的三个稳定入口，并让用户管理个人资料、收藏、拉黑和隐私设置。

## Scope

In scope:

- 地图、卡片列表、我的三个 Tab 导航。
- 我的资料查看/修改、身份审核状态、我的发布、收藏和拉黑列表。
- 隐私协议、用户协议入口、联系方式访问和地图隐私说明。
- 详情页拉黑/取消拉黑；拉黑对象从当前用户地图、列表、收藏中隐藏。
- 登录失效、空列表、加载、错误和重试状态。

Out of scope:

- 聊天、通知、账号注销、复杂设置、推荐和移动端客户端。

## Acceptance Criteria

- [ ] 三个 Tab 可从任意主工作区稳定切换并保留筛选/返回语义。
- [ ] 启动页仅展示简短启动信息，登录恢复完成后自动进入已绑定角色的工作区，不要求重复选择角色或授权手机号。
- [ ] 底部三个 Tab 在地图、列表、我的页面持续可见，当前 Tab 明确高亮，切换不丢失角色和筛选上下文。
- [ ] 用户可以查看和修改允许修改的个人资料，不能修改身份类型或他人资料。
- [ ] 用户可以查看自己的发布、收藏和拉黑列表。
- [ ] 拉黑立即隐藏目标，取消拉黑后目标可以重新出现；不能影响其他用户。
- [ ] 失效对象、空数据、网络失败和登录过期均有明确页面状态。
- [ ] 隐私协议和位置隐私说明可从“我的”进入。

## Architecture Impact

- API/Database: ADR-006 defines opaque user-level blocks, owner profile updates and composition of existing owner APIs; `market_user_blocks` is the only new source table.
- Security/privacy: Clients submit market target IDs and never receive internal user IDs; list, map, detail and favorites filter before projection/aggregation.
- Client: Map/list remain modes of the existing market page with persisted role-scoped workspace state; My Center composes identity, publication, favorite and blocklist APIs.
- Rollback: Navigation and block actions can be hidden while retaining private block rows; source market data is unchanged.

## Implementation Checklist

### Backend

- [ ] Add private block persistence, create/list/delete APIs and owner profile update.
- [ ] Apply one shared block predicate to lists, maps, details and favorites.
- [ ] Test self/other-user isolation, unblock recovery and profile ownership.

### Mini Program

- [ ] Add stable map/list/my navigation with role-scoped state restoration.
- [ ] Add My Center profile, status, publication, favorite, blocklist and legal entries.
- [ ] Add detail block confirmation and blocklist unblock flow.
- [ ] Add loading, empty, error, retry and expired-session states.

## Test Plan

- [ ] Backend block lifecycle, all market projections, favorites, isolation and profile authorization.
- [ ] Mini Program navigation/state, My Center, legal pages and block/unblock rendering.
- [ ] DevTools two-role map/list/my, block disappearance, unblock recovery and profile edit.

## Client Architecture Pre-Coding Check

- Target/module: Existing market page, new My Center/blocklist/legal pages, registration profile editor and shared main-tab utility.
- Existing pattern and owner: Page modules own UI state, `services/api.js` owns transport, backend owns authorization/filter semantics, and `app.globalData` owns session-scoped workspace state.
- Responsibility and dependency decision: Preserve one market state owner for map/list and add role-scoped snapshots only for return semantics; My Center composes existing endpoints and does not duplicate source records.
- Shared vs target-specific decision: OpenAPI owns block/profile semantics; navigation rendering, WeChat lifecycle and static legal copy are Mini Program-specific.
- State/contract/security impact: Block IDs are opaque and private; session expiry continues through the API client's existing 401 clearing path.
- Verification plan: Backend integration tests, utility tests, all Mini Program syntax/tests, delivery runner and DevTools navigation/block/profile flows.
- Architecture review: Completed in ADR-006; no new client framework or external dependency.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `ideas/map-location-tags.md`, `docs/requirements.md`, task | 三 Tab、我的中心和拉黑 MVP 已定义，依赖双向收藏任务 | 设置和账号注销范围待后续确认 | Architect defines blacklist persistence and navigation/API contract |
| 2026-07-14 | Architect Agent | Backend / Mini Program / Test | Ready for Architecture | Ready for Implementation | ADR-006, architecture/database/OpenAPI and task pre-coding check | Opaque block IDs, shared query filtering, owner profile update and one market state owner defined; OpenAPI parsing/workflow validation required before implementation | None | Implement backend contract, then Mini Program pages. |
| 2026-07-15 | Backend / Mini Program Agent | Backend / Mini Program | Ready for Implementation | In Progress | `backend/src/db.js`, `backend/src/app.js`, `frontend/miniprogram/app.json`, `frontend/miniprogram/services/api.js`, `frontend/miniprogram/pages/my-center/*`, market and role-home pages | Added private block persistence and owner-scoped create/list/delete APIs; applied block filtering to market list/detail/map/favorites; added My Center, favorites/blocklist links, loading/empty/error/retry states and detail block confirmation. `npm test` 13 passed; Mini Program tests 7 passed; `ruby scripts/deliver.rb my-center-and-blocklist` passed at `/tmp/ppfiles-learn-delivery/TASK-20260714-010/20260715-114953-cad71b/report.md`; workflow validation passed | Profile edit API, true global three-tab navigation, and DevTools/real-device verification remain | Complete profile editing and global tab navigation, then Test Agent verifies acceptance criteria |
| 2026-07-15 | Mini Program Agent | Test Agent | In Progress | Blocked | `frontend/miniprogram/app.js`, `frontend/miniprogram/app.json`, `frontend/miniprogram/pages/startup/*`, `frontend/miniprogram/pages/role-home/*`, `frontend/miniprogram/pages/market/*`, `frontend/miniprogram/pages/my-center/*`, `frontend/miniprogram/pages/favorites/*`, `frontend/miniprogram/pages/market-detail/*` | Added startup session routing, role-scoped workspace state, persistent map/list/my navigation, legal entries, independent detail and favorites return paths; Mini Program syntax/session/registration tests passed; `ruby scripts/deliver.rb my-center-and-blocklist` passed at `/tmp/ppfiles-learn-delivery/TASK-20260714-010/20260715-121303-f71195/report.md` | Profile editing and WeChat DevTools/real-device navigation remain | Implement or verify remaining profile editing path, then run platform acceptance. |
