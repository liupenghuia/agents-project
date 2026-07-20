---
id: TASK-20260715-012
title: 第一阶段核心闭环完善
status: Done
priority: P1
owner: Test Agent
created: "2026-07-15"
updated: "2026-07-15"
source_idea: IDEA-20260713-001
depends_on: []
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
  design: Done
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

# 任务：第一阶段核心闭环完善

## Product Decision

第一阶段先完善现有身份、工作区、信息市场和安全操作闭环，不增加聊天、推荐或商业化。

## Scope

- 手机号授权后绑定唯一角色；启动时恢复微信会话并进入角色工作区。
- 地图、列表、我的三个底部 Tab，保留角色和市场筛选上下文。
- 查看和修改自己的资料、我的发布、下架、重新提交和审核状态。
- 独立筛选面板、统一市场卡片、独立详情页和明确返回路径。
- 收藏、取消收藏、举报、拉黑、取消拉黑、失效对象和错误重试状态。

## Non-goals

- 聊天、投递、面试、录用、通知、推荐、自动匹配、支付、会员、实名认证、企业认证和移动端客户端。

## Product Flow

### Returning User

1. 用户打开小程序。
2. 启动页恢复微信会话和手机号绑定角色。
3. 有效会话直接进入角色工作区；失效会话清空旧状态并重新登录。

### Market Use

1. 用户从地图或列表进入市场。
2. 使用筛选面板调整工种、薪资、方式、地区和发布时间。
3. 查看安全摘要卡片并进入独立详情页。
4. 联系、收藏、举报或拉黑，操作结果即时反馈。

### Owner Management

1. 用户从“我的”进入资料或我的发布。
2. 修改自己的资料或发布信息。
3. 保存成功后显示最新状态；失败保留输入并支持重试。
4. 下架、打回和重新提交必须显示原因和下一步操作。

## State And Error Requirements

- Startup: `restoring`, `ready`, `login_required`, `error`。
- Identity: `pending_review`, `approved`, `changes_requested`。
- Publication: `published`, `pending_review`, `changes_requested`, `disabled`。
- Every main page must cover loading, empty, validation failure, network failure, expired session, retry and duplicate-submit prevention.
- Role and phone binding errors must explain that the role cannot be switched and must not expose internal account data.

## Product Metrics

- 首次启动到角色工作区进入成功率。
- 注册提交成功率和手机号/角色冲突率。
- 市场筛选到详情进入率。
- 详情到收藏、联系、举报的操作成功率。
- 发布者修改/重新提交完成率。
- 失效对象被错误展示或错误暴露联系方式的次数，目标为 0。

## Acceptance Criteria

- [x] 新用户完成手机号授权和角色注册后，重启小程序可直接进入对应角色工作区。
- [x] 已过期会话不会展示旧用户数据，并提供重新登录入口。
- [x] 地图、列表、我的三个 Tab 可从任一主工作区切换，角色和筛选状态不丢失。
- [x] 用户只能查看和修改自己的资料及发布信息，角色类型不可修改。
- [x] 筛选应用后地图和列表结果一致，重置后恢复默认结果并重新开始分页。
- [x] 列表不展示联系方式和精确地址；详情按权限展示联系方式。
- [x] 收藏、举报、拉黑操作有明确反馈并防止重复提交。
- [x] 收藏列表能识别失效对象，失效对象不能展示联系方式。
- [x] 拉黑和取消拉黑只影响当前用户，并能验证隐藏与恢复。
- [x] 正常、加载、空、校验失败、网络失败、登录过期和重试状态均可验证。
- [ ] 微信 DevTools/真机完成授权、地图、定位、上传、Tab 导航和详情操作验收。

## Known Limitations

- 微信 DevTools/真机平台验收未在本机执行（工具不可用）。自动化语法、单元/集成测试与 delivery runner 已通过；平台验收记为后续 release smoke，不阻塞本地 Definition of Done。

## Client Architecture Pre-Coding Check

- Target/module: Mini Program startup/session restoration, role workspace navigation, My Center, market filter/list/detail and favorite/safety actions.
- Existing pattern and owner: `app.js` owns session/workspace state; page modules own UI orchestration; `services/api.js` owns transport; backend owns authorization and state transitions.
- Responsibility decision: Reuse existing API client and market projections; add only missing owner-profile contract and navigation/state helpers.
- Shared vs target-specific: API semantics are shared; startup lifecycle, bottom navigation, phone authorization and map rendering remain Mini Program-specific.
- Security/state: Phone-role uniqueness, session expiry, owner-only profile updates, contact logging, privacy-safe map projection and block filtering remain server-enforced.
- Verification: Backend tests, API contract checks, Mini Program syntax/state tests, then DevTools/real-device flows.
- Architecture review: Completed; no new framework, service or persistence boundary.

## Architecture Decision

- Keep the modular monolith and current REST boundaries.
- Add owner profile update endpoints only where existing pages cannot complete the requirement.
- Normalize UI filters in the Mini Program and map to direction-specific API fields at the client boundary.
- Keep visibility, authorization, privacy projection and block predicates in backend queries.
- Store only role-scoped navigation snapshots; never cache contact data, secrets, raw coordinates or detailed addresses.
- Use an independent detail route for contact, favorite, report and block actions.
- Reuse existing role profile tables; no duplicate profile source.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15 | Product Agent | Architect Agent | Draft | Ready for Architecture | `docs/requirements.md`, task | First-phase scope prioritized around identity restoration, workspace, profile/publication management, market usability and safety; chat/recommendation/commercialization deferred | DevTools and production gates remain separate | Architect defines implementation slices |
| 2026-07-15 | Architect Agent | Backend / Mini Program / Test Agent | Ready for Architecture | Ready for Implementation | task, existing architecture/API/client boundaries | Reused modular monolith, API client, market projections and role-scoped state; client architecture check recorded | Owner profile update and platform verification remain dependencies | Implement backend contract and Mini Program first slice |
| 2026-07-15 | Backend / Mini Program Agent | Test Agent | Ready for Implementation | Ready for Test | `backend/src/app.js`, `backend/src/db.js`, `backend/test/app.test.js`, `frontend/miniprogram/pages/startup/*`, `pages/my-center/*`, `pages/profile/*`, `pages/market-detail/*`, `pages/market/*`, `pages/favorites/*`, `pages/role-home/*`, `app.js`, `app.json`, `services/api.js` | Prior related scopes (session, market, my-center, favorites, detail) completed phase-one behaviors; backend `npm test` 14 pass; Mini Program all tests pass | DevTools platform gate pending | Test Agent independent acceptance |
| 2026-07-15 | Test Agent | — | Ready for Test | Done | task | `ruby scripts/deliver.rb phase-one-product-completion` Passed (`/tmp/ppfiles-learn-delivery/TASK-20260715-012/20260715-162328-ef4071/report.md`); `npm test` 14 pass; Mini Program 8 test files pass; acceptance criteria 10/11 automated, DevTools recorded as known limitation | None | Proceed to TASK-20260715-013 |
