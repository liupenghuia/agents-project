---
id: TASK-20260714-010
title: 小程序三 Tab 我的中心与拉黑
status: Ready for Architecture
priority: P1
owner: Product Agent
created: "2026-07-14"
updated: "2026-07-14"
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
  architecture: Pending
  backend: Pending
  frontend: Pending
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
- [ ] 用户可以查看和修改允许修改的个人资料，不能修改身份类型或他人资料。
- [ ] 用户可以查看自己的发布、收藏和拉黑列表。
- [ ] 拉黑立即隐藏目标，取消拉黑后目标可以重新出现；不能影响其他用户。
- [ ] 失效对象、空数据、网络失败和登录过期均有明确页面状态。
- [ ] 隐私协议和位置隐私说明可从“我的”进入。

## Architecture Impact

- API/Database: 需要用户黑名单、我的聚合接口或明确的分页接口。
- Security/privacy: 黑名单是用户私有数据；禁止通过列表、收藏或地图侧信道泄露拉黑关系。
- Rollback: Tab 入口和拉黑入口可通过配置关闭，保留原市场列表。

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `ideas/map-location-tags.md`, `docs/requirements.md`, task | 三 Tab、我的中心和拉黑 MVP 已定义，依赖双向收藏任务 | 设置和账号注销范围待后续确认 | Architect defines blacklist persistence and navigation/API contract |
