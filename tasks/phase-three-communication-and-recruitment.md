---
id: TASK-20260715-014
title: 第三优先级沟通与招聘流程
status: Done
priority: P2
owner: Test Agent
created: "2026-07-15"
updated: "2026-07-15"
source_idea: IDEA-20260713-001
depends_on:
  - TASK-20260715-013
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

# 任务：第三优先级沟通与招聘流程

## Product Decision

第三优先级把当前“详情页电话联系”扩展成可追踪的站内招聘协作流程。第一阶段只做文本沟通和最小投递状态，不做复杂 CRM、支付或自动推荐。

产品默认决策：

- 电话联系和站内消息并存；电话继续受联系方式权限和访问频率限制，站内消息用于减少公开暴露联系方式。
- 只有双方拥有对应的已审核角色时才能沟通。
- 任一方可以从详情页发起沟通；被联系方可以回复、拒绝或拉黑。
- 求职者发起一次投递；招聘者可以查看、标记和更新处理状态。
- 所有用户内容都可举报；拉黑后会话和投递入口停止，但历史记录保留给必要的安全审查。

## Architecture Defaults

- Modular monolith; new domain module `backend/src/collaboration.js`.
- Rate limits: conversation starts 20/day, messages 60/hour, applications 20/day.
- Message max length 1000; text only; idempotent via `clientRequestId`.
- Application terminal states cannot reopen; withdraw only from `submitted`/`viewed`.
- Interview cancel requires reason; accept/decline only by applicant while `invited`.

## User Flows

### 站内沟通

1. 用户从市场详情点击“站内沟通”。
2. 系统校验登录状态、审核身份、目标信息仍为公开状态和双方是否已拉黑。
3. 用户发送首条文本消息。
4. 对方在“消息”中看到未读会话并回复。
5. 任一方可以结束会话、举报或拉黑。

### 求职投递

1. 求职者从招聘详情点击“表达兴趣”。
2. 系统展示将被招聘方看到的资料摘要和隐私提示。
3. 求职者确认后创建一条投递记录，重复投递保持幂等。
4. 招聘者查看投递并更新为“待处理、已联系、面试中、已录用、已结束或已拒绝”。
5. 求职者看到状态变化，但不能替招聘者修改处理状态。

### 招聘邀请和面试

1. 招聘者从投递记录发出邀请。
2. 求职者接受或拒绝邀请。
3. 双方看到面试时间、地点摘要和当前状态。
4. 任一方可以取消面试，取消原因和时间保留在记录中。

## Intended Scope

- 站内文本会话、未读数、已读状态、结束、举报和拉黑。
- 求职者表达兴趣/投递，招聘者查看、筛选和处理候选人。
- 招聘邀请、接受/拒绝和最小面试安排。
- 消息、投递和面试的加载、空、错误、重试、权限和登录失效状态。

## State Model

### Conversation

`active` → `ended` / `blocked`

### Application

`submitted` → `viewed` → `contacted` → `interviewing` → `hired` / `rejected` / `withdrawn` / `closed`

允许重复请求保持幂等；终态不能被普通用户重新打开。

### Interview

`invited` → `accepted` / `declined` / `cancelled` / `completed`

## Acceptance Criteria

- [x] 已审核用户可以从详情页发起站内文本沟通，未审核身份不能发起。
- [x] 双方只能看到自己参与的会话，不能通过参数访问他人会话。
- [x] 消息发送防重复，支持发送中、发送失败、重试、未读和已读状态。
- [x] 拉黑后不能继续发送消息或创建新的投递，历史记录按隐私规则保留。
- [x] 求职者可以对同一招聘信息幂等投递、撤回未处理投递，并看到当前状态。
- [x] 招聘者可以查看自己收到的投递并更新允许的处理状态。
- [x] 招聘者不能修改不属于自己的投递，求职者不能修改招聘方处理状态。
- [x] 招聘者可以发起招聘邀请，求职者可以接受或拒绝。
- [x] 双方可以查看和取消面试安排，取消必须记录原因。
- [x] 失效、下架、拉黑和权限变化会阻止新的沟通/投递/邀请，并显示明确原因。
- [x] 消息、投递和面试操作均产生必要的安全审计记录。
- [x] 小程序覆盖列表、详情、空、加载、失败、重试、登录失效和未读状态。

## Privacy And Safety

- 列表和投递摘要不公开手机号、微信号、精确地址和内部用户 ID。
- 消息内容限制长度和类型，第一版不支持文件、图片和外链。
- 联系频率、首条消息频率和投递频率需要服务端限流。
- 被举报或拉黑的会话进入安全审查范围，但普通用户不能查看对方内部风控信息。
- 管理员可以按权限查看举报内容和必要的会话/投递审计摘要，不直接修改用户消息。

## Non-goals

- 自动匹配、推荐算法、AI 面试、支付、担保、背景调查、语音/视频通话、文件简历和复杂 CRM。

## Known Limitations

- 微信 DevTools 端到端 UI 验收未运行。
- 管理员审计查询 UI 未单独扩展；`collaboration_audits` 已写入供后续运营使用。
- 消息推送通知未做，需用户主动打开消息页。

## Client Architecture Pre-Coding Check

- Target: Mini Program messages/conversation/applications/interviews + market-detail entry points.
- Existing owner: market detail owns contact entry; new pages own collaboration UI; `services/api.js` owns transport; backend owns authorization and state machines.
- Decision: keep collaboration domain in backend module; Mini Program only orchestrates UX states.
- Security: participant isolation, block checks, approved-role gates and rate limits are server-enforced.
- Verification: backend collaboration test, Mini Program syntax, delivery runner.
- Architecture review: completed; no new platform dependency.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15 | Product Agent | Architect Agent | Draft | Ready for Architecture | task | 已冻结站内消息、投递、邀请、面试的最小流程、权限、状态和非目标 | 频率阈值、消息保留时长和通知渠道需架构阶段给出默认值 | TASK-013 测试通过后进入架构设计 |
| 2026-07-15 | Architect Agent | Backend / Mini Program | Ready for Architecture | Ready for Implementation | task | collaboration module + REST endpoints + Mini Program pages planned | Push notifications deferred | Implement and test |
| 2026-07-15 | Backend / Mini Program Agent | Test Agent | Ready for Implementation | Ready for Test | `backend/src/collaboration.js`, `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `frontend/miniprogram/pages/messages/*`, `conversation/*`, `applications/*`, `interviews/*`, `market-detail/*`, `my-center/*`, `role-home/*`, `services/api.js`, `app.json` | Collaboration API + Mini Program entry flows implemented | DevTools pending | Independent acceptance |
| 2026-07-15 | Test Agent | — | Ready for Test | Done | task | `npm test` 16 pass including collaboration; Mini Program tests pass; `ruby scripts/deliver.rb phase-three-communication-and-recruitment` Passed (`/tmp/ppfiles-learn-delivery/TASK-20260715-014/20260715-163514-f17aba/report.md`) | None | Optional DevTools smoke |
