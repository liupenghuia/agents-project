---
id: TASK-20260716-016
title: 在线联系入口与联系历史（置顶/删除）
status: Ready for Architecture
priority: P1
owner: Architect Agent
created: "2026-07-16"
updated: "2026-07-16"
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
  miniprogram: Pending
  web: N/A
scope_status:
  product: Done
  architecture: Pending
  design: Pending
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

# 任务：在线联系入口与联系历史（置顶/删除）

## Origin

- Source idea: `None`。本需求为第三优先级沟通能力（`TASK-20260715-014`）的体验增强，直接从产品负责人需求进入任务，不单独做 Idea Discovery。
- Promotion decision/evidence: 2026-07-16 Product Agent 根据负责人描述与现网已交付的站内会话能力，冻结范围与验收标准；状态进入**待执行**（工作流：`Ready for Architecture`）。

## Goal

已审核的招聘者/应聘者在浏览对方市场信息时，能更顺畅地发起**在线联系**；并能在**联系历史**中再次找到会话，支持**置顶**与**删除（仅从自己列表移除）**，减少找人、回访的成本。

## Users And Assumptions

- Primary user:
  - 应聘方：浏览招聘卡片/详情后发起在线联系，管理联系历史。
  - 招聘方：浏览求职卡片/详情后发起在线联系，管理联系历史。
- Assumptions:
  - 复用现有站内文本会话（`conversations` / `messages`），不引入第三方 IM 作为本任务必选项。
  - 「删除」= 仅从**当前用户**的联系历史隐藏，不销毁对方记录、不等于「结束会话」。
  - 「置顶」= 仅影响当前用户列表排序。
  - 电话联系、投递、面试能力保持现状，本任务不改其业务规则。
- External dependencies: 无新的付费外部服务；不依赖微信客服消息。

## Product Decision

产品默认决策（可被架构微调实现细节，不可改变用户结果）：

1. **在线联系入口**
   - 市场**列表卡片**提供「在线联系」快捷入口（不替代点卡片进详情）。
   - **详情页**保留并强化在线联系主操作（现有「站内沟通」统一文案为「在线联系」）。
   - 地图 marker 点击仍先进详情，再从详情发起联系。
2. **联系历史**
   - 现有「消息」列表产品定位升级为**联系历史**（可改标题/空态文案；路径可保留）。
   - 展示对方称呼、最后一条消息、未读、会话状态、置顶标识。
3. **置顶**
   - 仅本人列表生效；建议上限 10 条（架构可确认默认值）。
   - 支持取消置顶。
4. **删除**
   - 从本人联系历史移除（隐藏）。
   - 对方仍可查看会话；若对方再发消息或本人从卡片再次发起联系，会话应重新出现在本人历史中。
   - 与「结束会话」（双方不可继续发言）明确区分：结束保留在会话页；删除是列表管理动作。
5. **权限与安全**
   - 沿用：已审核对端身份、目标信息仍公开、未拉黑、不可联系自己、服务端限流。
   - 列表与历史不新增暴露手机号/精确地址。

## Scope

In scope:

- 小程序：卡片在线联系入口、详情文案/入口统一、联系历史列表与置顶/删除交互、加载/空/错误/权限态。
- 后端：会话列表排序与过滤、用户侧置顶/隐藏偏好（或等价能力）、发起联系/新消息时恢复已隐藏会话。
- 契约：OpenAPI / database 与实现一致；必要测试。

Out of scope:

- 接入腾讯云 IM / 云信等第三方 IM。
- 推送通知、语音/图片/文件消息。
- 群聊、已读回执细节产品化重构。
- Web 管理端会话运营、iOS/Android 原生端。
- 推荐排序、自动匹配。

## User Stories

- As an 已审核应聘者, I want 在招聘卡片上直接点「在线联系」, so that 不必先读完详情也能开启沟通。
- As an 已审核招聘者, I want 在求职卡片/详情发起在线联系, so that 快速触达意向人选。
- As a 用户, I want 在联系历史中看到过往会话并再进入, so that 我能继续跟进。
- As a 用户, I want 置顶重要会话, so that 常联系的对象排在前面。
- As a 用户, I want 删除不需要的历史, so that 列表更干净且不误伤对方记录。

## User Flows

### 从卡片在线联系

1. 用户在地图列表或卡片列表看到对方信息卡。
2. 点击「在线联系」（不进详情亦可）。
3. 系统校验登录、身份、目标可用性、拉黑关系。
4. 成功则进入会话页（新建或复用已有会话）；失败展示可读原因。

### 从详情在线联系

1. 用户打开招聘/求职详情。
2. 点击「在线联系」。
3. 进入会话页；可发送文本（沿用现有首条问候或空会话策略，由架构确认默认值）。

### 管理联系历史

1. 用户打开联系历史（原消息页）。
2. 看到按「置顶优先 + 最近更新」排序的会话。
3. 置顶/取消置顶后列表顺序立即更新。
4. 删除前确认：说明仅从自己历史移除；确认后该行消失。
5. 若对方再发消息或自己再次发起联系，会话回到列表。

## Acceptance Criteria

- [ ] Given 已审核应聘者浏览公开招聘列表, when 点击卡片「在线联系」, then 进入与该招聘信息关联的会话（或复用已有会话），且未暴露对方手机号在列表层。
- [ ] Given 已审核招聘者浏览公开求职列表, when 点击卡片「在线联系」, then 同上，方向正确。
- [ ] Given 用户打开详情, when 点击「在线联系」, then 行为与现有站内沟通权限一致（未审核/下架/拉黑有明确失败提示）。
- [ ] Given 用户有多条会话, when 打开联系历史, then 可见对方称呼、最后消息摘要、未读与状态；置顶项排在非置顶之前。
- [ ] Given 用户置顶一条会话, when 刷新列表, then 仍保持置顶；取消置顶后按最近更新排序。
- [ ] Given 用户删除一条会话, when 确认删除, then 该会话从本人列表消失；对方列表不受影响；历史消息不因删除而被物理清空。
- [ ] Given 用户已删除某会话, when 对方发送新消息或本人再次从同一市场目标发起联系, then 该会话重新出现在本人联系历史中。
- [ ] Given 未登录或会话不属于当前用户, when 访问列表/置顶/删除, then 被拒绝且不泄露他人数据。
- [ ] Error、empty、loading、重试、登录失效在卡片发起、历史列表、会话跳转路径上可观察。
- [ ] 不引入列表级联系方式暴露；不把「删除」实现成双方结束发言（结束会话仍为独立能力）。

## Architecture Impact

- Architecture: 待架构确认——倾向复用 collaboration 域；新增 per-user 会话偏好（置顶/隐藏），不强制第三方 IM。
- API: 待架构——列表排序/过滤扩展；pin / hide（或 DELETE 软删）端点；start/send 清 hidden。
- Database/migration: 待架构——`conversation_user_prefs` 或等价表 + migration。
- Security/privacy: 参与者隔离、隐藏仅本人、列表仍不回传联系电话。
- Compatibility/versioning: 扩展现有 Conversation DTO 字段；旧客户端忽略未知字段。
- Rollback: 偏好表可停用端点回退为仅时间序列表。

## Client Architecture Pre-Coding Check

| Target/module | Existing pattern and owner | Responsibility/dependency decision | Shared vs target-specific | State/contract/security impact | Verification plan | Architecture review |
| --- | --- | --- | --- | --- | --- | --- |
| miniprogram market cards + market-detail | `create-market-page` / `market-detail` 详情发起；`api.startConversation` | 卡片增加快捷入口；编排抽到 contact application service；权限服务端为准 | 仅小程序 | 新增发起路径的 loading/error；不在列表暴露联系方式 | 页面语法 + contact-app 单测 + 手工主路径 | Required（Architect 确认契约与偏好模型） |
| miniprogram messages（联系历史） | `pages/messages` + `listConversations` | 升级为历史管理 UI；置顶/删除调新 API；乐观更新 | 仅小程序 | 列表排序/隐藏/置顶状态 | 列表映射单测 + 集成 | Required |

## Implementation Checklist

### Backend

- [ ] Work or `N/A` reason: 会话偏好与列表/pin/hide 及恢复规则
- [ ] Tests: 域/API 集成覆盖隐藏、置顶排序、复活

### Frontend Coordination

- [ ] Work or `N/A` reason: 仅小程序目标
- [ ] Aggregate frontend status and cross-target decision: miniprogram only

### WeChat Mini Program

- [ ] Work or `N/A` reason: 入口、联系历史、编排服务
- [ ] UI states and tests: 加载/空/错/置顶/删除确认

### Web

- [ ] Work or `N/A` reason: N/A

### Shared Mobile / iOS / Android

- [ ] Work or `N/A` reason: N/A

## Test Plan

- [ ] Unit: 列表排序/映射、小程序 contact-app
- [ ] Integration/contract: OpenAPI 会话列表与 pin/hide
- [ ] UI/end-to-end: 卡片联系 → 历史置顶/删除 → 再次发起复活（可用 runner + 手工）
- [ ] Regression: 现有沟通/投递/面试与拉黑

## Verification Evidence

| Date | Scope | Command/check | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-16 | product | Product gate + `ruby scripts/validate_workflow.rb` | Passed (2 ideas, 17 tasks, 0 issues) | task + requirements |

## Release Plan

- Environment/artifact: 本地/既有部署即可；`release_required: false`
- Deployment and smoke test: 小程序主路径冒烟
- Monitoring and rollback: 关闭 pin/hide 端点可回退

## Known Limitations

- 实时推送不做；用户需打开联系历史或会话页刷新。
- 置顶上限默认 10，架构可调整。
- 不强制引入 Vant 等 UI 库；实现可选原生 ActionSheet。

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16 | Product Agent | Architect Agent | Draft | Ready for Architecture | `tasks/contact-history-and-online-contact.md`, `docs/requirements.md` | 产品范围与验收已冻结；状态**待执行**（`Ready for Architecture`）；无独立 Idea，依赖 TASK-014 已 Done | 置顶上限、DTO 字段名、隐藏复活触发点由架构确认 | 架构定义 API/库表/回滚后转入 `Ready for Implementation` |
