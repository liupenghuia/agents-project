---
id: TASK-20260713-002
title: 招聘平台角色选择与注册审核
status: Blocked
priority: P1
owner: Test Agent
created: "2026-07-13"
updated: "2026-07-16"
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
  web: true
frontend_target_status:
  miniprogram: Done
  web: Done
scope_status:
  product: Done
  architecture: Done
  design: Pending
  backend: Done
  frontend: Done
  mobile: N/A
  ios: N/A
  android: N/A
  test: Blocked
  release: N/A
release_required: false
blocked_reason: 本地自动化与交付 runner 已通过；仅剩真实微信授权流程和浏览器内 Web 管理端审核/权限人工验收。
blocked_since: "2026-07-14"
unblock_owner: Test Agent
unblock_condition: 完成管理员登录、审核、账号管理浏览器验收，以及小程序真实授权/双身份恢复流程验收，并记录步骤证据。
---

# 任务：招聘平台角色选择与注册审核

## Origin

- Source idea: `IDEA-20260713-001`
- Promotion decision/evidence: 用户确认第一阶段只做微信小程序、角色选择、手机号绑定的单角色注册和人工审核。

## Goal

让新用户在微信小程序中选择“招人”或“应聘”，完成手机号授权和对应身份的注册资料提交；手机号绑定的角色不可转换，也不能使用同一手机号注册另一种角色。提交后进入人工审核，审核状态清晰可见。

## Users And Assumptions

- 招人方：需要创建招人身份并提交招人资料。
- 应聘方：需要创建应聘身份并提交求职资料。
- 审核人员：人工检查注册资料并决定通过、拒绝或要求修改。
- 登录基础：遵循微信小程序规范，以微信用户身份作为账户基础；具体授权流程由 Architect Agent 确认。

## Scope

### In scope

- 微信小程序新用户入口。
- “招人”和“应聘”两个角色入口。
- 招人方和应聘方独立的最小注册表单。
- 手机号授权后绑定唯一角色。
- 身份创建后不能把一种身份直接转换成另一种身份。
- 注册提交后进入人工审核。
- 待审核、审核通过、审核拒绝/需修改状态。
- 表单校验、重复提交、授权失败、网络失败和审核结果展示。
- 受保护的审核操作入口，或已记录并可审计的现有运营工具接入；不允许直接修改数据库完成审核。

### Out of scope

- 职位发布、简历、搜索、匹配、投递和沟通。
- 实名认证、身份证件采集和企业认证。
- iOS App、Android App 和其他客户端。
- 支付、会员和推荐算法。

## Proposed Minimum Registration Fields

以下字段是基于主流招聘产品的产品建议，Architect 和 Product 评审后才能冻结为契约。

### 招人方

- 招聘主体名称：企业名称或个人招聘名称。
- 招聘主体类型：企业/个体/个人等最小选项。
- 联系人称呼。
- 微信授权联系方式或手机号（按微信规范获取）。
- 所在地区。
- 招聘行业或主要岗位方向。

### 应聘方

- 姓名或平台展示昵称。
- 微信授权联系方式或手机号（按微信规范获取）。
- 所在地区。
- 期望岗位或工种。
- 工作经验概况。
- 可工作的地区或时间偏好。

## Acceptance Criteria

- [ ] 新用户首次进入微信小程序能看到“招人”和“应聘”两个清晰入口。
- [ ] 未选择角色时不能进入注册表单。
- [ ] 点击“招人”进入招人方注册流程；点击“应聘”进入应聘方注册流程。
- [ ] 两种身份展示各自的最小注册字段，并在提交前完成必填和格式校验。
- [ ] 注册流程遵循微信小程序授权、隐私和用户协议规范，不使用自建密码作为第一阶段前置条件。
- [ ] 已完成手机号授权的账户只能拥有一个角色，不能使用同一手机号注册或切换到另一角色。
- [ ] 已创建的身份类型不能直接转换；创建另一种身份必须走另一套身份注册流程。
- [ ] 注册资料提交成功后，身份状态为“待人工审核”，用户不能误以为已审核通过。
- [ ] 审核人员可以查看注册资料并设置“通过”或“拒绝/需修改”，拒绝结果包含可展示给用户的原因。
- [ ] 用户再次进入小程序时自动恢复有效微信会话并直接进入已绑定角色的工作区；不重复角色选择和手机号授权。
- [ ] 已审核通过的身份进入对应端入口；待审核和拒绝/需修改身份进入状态处理页。
- [ ] 重复提交、授权取消、授权失败、网络失败和服务错误都有明确提示和可恢复操作。
- [ ] 第一阶段不采集实名认证材料、不做企业认证，并且产品页面不暗示已完成身份认证。
- [ ] 测试 Agent 可以验证角色绑定、重复角色注册拒绝、自动恢复、审核状态和主要异常流程。

## Architecture Impact

- Architecture: 模块化单体；微信会话、用户账户、身份档案、注册和审核模块边界已记录在 `docs/architecture.md`。
- API: `docs/openapi.yaml` 定义微信会话、身份创建/列表/详情/重提和审核接口。
- Database/migration: `docs/database.md` 定义 `auth_accounts`、`sessions`、`role_profiles`、两类 profile、`review_actions`、`admin_accounts` 和 `admin_roles`。
- Security/privacy: 后端交换微信登录 code；不暴露 `openid`/`session_key`，不做实名认证；Web 管理员使用独立账号密码登录，权限变更和审核操作必须授权并审计。
- Compatibility/versioning: 第一阶段只支持微信小程序；账户与身份模型保留未来客户端/provider 扩展空间。
- Rollback: 审核动作追加记录；`changes_requested` 允许同角色资料重提，不允许修改身份类型。

## Implementation Checklist

### Backend

- [x] 实现 `POST /auth/wechat/session` 会话交换。
- [x] 实现微信用户账户与多身份数据模型。
- [x] 实现两类注册资料校验和提交接口。
- [x] 实现身份列表、详情和审核状态接口。
- [x] 实现人工审核通过、拒绝/需修改及原因记录。
- [x] 实现重复身份、重复提交和管理员权限校验。
- [x] 后端单元、集成和权限测试。

### Frontend Coordination

- [x] Aggregate frontend coordination and cross-target API decisions（OpenAPI 共享会话/身份/审核契约；小程序走用户会话，Web 走管理员会话）。

### WeChat Mini Program

- [x] 微信小程序双入口首页。
- [x] 招人方注册表单。
- [x] 应聘方注册表单。
- [x] 角色入口和不可转换提示。
- [x] 微信授权、隐私、表单、提交、审核状态和异常页面。
- [x] 身份状态页与审核结果展示（待审核/通过/需修改）；人工审核入口归属 Web 管理端。
- [x] 小程序注册校验与会话恢复自动化测试（`tests/registration.test.js`、`tests/session.test.js`）。

### Web Management System

- [x] 管理员登录和会话管理。
- [x] 管理员账号创建、禁用、密码变更和角色分配。
- [x] `owner`、`admin`、`reviewer`、`operator` 权限规则。
- [x] 身份审核队列、审核状态、拒绝原因和审核操作。
- [x] 权限变更、账号变更和审核操作审计日志。
- [x] Web 权限与审核决策纯函数测试（`tests/permissions.test.js`、`tests/moderation.test.js`）；后端集成覆盖登录/RBAC/审核。

### Shared Mobile / iOS / Android

- [x] `N/A`：第一阶段只交付微信小程序。

## Test Plan

- [x] 角色入口和未选择角色保护（小程序页面与注册校验；本地自动化覆盖字段/入口逻辑）。
- [x] 两类注册字段、校验和提交（后端集成 + `registration.test.js`）。
- [x] 手机号与角色唯一绑定及重复角色注册拒绝（后端：`PHONE_ROLE_BOUND`）。
- [x] 身份不可直接转换（创建另一角色须走独立注册接口；重复同角色拒绝）。
- [x] 待审核、通过、拒绝/需修改状态（后端审核决策 + 小程序状态页）。
- [x] 授权取消、重复提交、网络失败和恢复（客户端错误态与会话恢复单测；真实微信授权 UI 仍待平台验收）。
- [x] 回归测试和工作流校验（`npm test`、交付 runner、`validate_workflow.rb`）。
- [ ] **平台人工验收（阻塞关闭）**：浏览器内 Web 管理员登录/审核/账号与权限操作。
- [ ] **平台人工验收（阻塞关闭）**：微信 DevTools/真机授权、启动恢复、跨角色拒绝可见提示。

## Verification Evidence

| Date | Scope | Command/check | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-13 | Product | `ruby scripts/validate_workflow.rb` | Passed | Product Brief promoted and task linked |
| 2026-07-16 | Backend | `cd backend && npm test` | 28 passed | Session/phone/role binding, review RBAC, admin rate-limit/account protection, market/collab regression |
| 2026-07-16 | Mini Program | `node tests/registration.test.js`; `node tests/session.test.js` | Passed | Registration validation + session lifecycle |
| 2026-07-16 | Web | `node tests/permissions.test.js`; `node tests/moderation.test.js`; `node --check app.js permissions.js moderation.js` | Passed | Role modules + moderation decision vocabulary |
| 2026-07-16 | Workflow | `ruby scripts/validate_workflow.rb` | Passed | 2 ideas, 16 tasks, 0 issues |
| 2026-07-16 | Delivery | `ruby scripts/deliver.rb recruitment-role-registration` | Passed | `/tmp/ppfiles-learn-delivery/TASK-20260713-002/20260716-160039-f521a1/report.md` |

## Release Plan

- Environment/artifact: 待定义。
- Deployment and smoke test: 待 Architect/Test Agent 定义。
- Monitoring and rollback: 待定义。

## Known Limitations

- 微信授权具体组合、审核时限和修改次数需要运营评审；审核操作入口已纳入实施门禁。
- 最小注册字段仍需经过原型和产品评审冻结。

## Client Architecture Pre-Coding Check

- Target/module: Mini Program registration and session lifecycle.
- Existing pattern and owner: Pages own presentation/orchestration; `services/api.js` owns transport; `app.js` owns session lifecycle; validation stays in `utils/registration.js`.
- Responsibility and dependency decision: Add identity-detail loading through the API service and deduplicate/clear sessions in the app owner; pages do not call raw transport.
- Shared vs target-specific decision: WeChat login/storage remains Mini Program-specific; HTTP error semantics remain shared through OpenAPI.
- State/contract/security impact: Preserve existing APIs; add loading/stale-session recovery without changing identity rules.
- Verification plan: Session/API adapter tests, registration validation tests, JS syntax, backend integration and delivery runner.
- Architecture review: Not required; this restores the documented existing ownership boundaries.

- Target/module: Web administrator login, role routing, identity review and administrator-account workspaces.
- Existing pattern and owner: Static app owns view orchestration, pure permission module owns visible/default workspace mapping, request boundary owns transport, backend owns RBAC.
- Responsibility and dependency decision: Split queue/decision/account loading locks and route each role to an authorized default workspace.
- Shared vs target-specific decision: RBAC semantics follow OpenAPI/architecture; DOM and focus behavior remain Web-specific.
- State/contract/security impact: No token persistence; unauthorized controls are hidden for UX while every operation remains server-authorized.
- Verification plan: Pure role-capability tests, Web syntax, admin/review backend integration, browser keyboard and responsive smoke.
- Architecture review: Not required; this aligns the client with the documented RBAC boundary.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13 | Product Agent | Coordinator | Draft | Ready for Architecture | `ideas/recruitment-platform.md`, task | `IDEA-20260713-001` promoted | None | Architect defines contracts and data model |
| 2026-07-13 | Architect Agent | Coordinator / Mini Program / Web | Ready for Architecture | Ready for Implementation | Architecture, OpenAPI, database, frontend target rules | `ruby scripts/validate_workflow.rb`; OpenAPI parsed | None | Backend, Mini Program, and Web agents implement scopes |
| 2026-07-13 | Frontend MiniProgram Agent | Coordinator / Test Agent | Ready for Implementation | In Progress | `frontend/miniprogram/app.*`, `pages/home/*`, `pages/register/*`, `pages/identities/*`, `services/api.js`, `utils/registration.js`, `tests/registration.test.js` | `node --check` for all Mini Program JS: Passed; `node frontend/miniprogram/tests/registration.test.js`: Passed; `ruby scripts/validate_workflow.rb`: Passed. WeChat DevTools render/authorization manual check: Not run, tool unavailable. | No issue created; runtime verification remains | Web target and backend continue; Test Agent runs Mini Program UI/flow checks |
| 2026-07-13 | Backend Agent | Backend | Pending | Done | `backend/package.json`, `backend/src/*`, `backend/test/app.test.js`, `backend/README.md`, `docs/openapi.yaml` | `npm test`: 5 passed; `node --check src/app.js`; `node --check src/db.js src/wechat.js src/server.js`; phone contract and client call verified | Admin Web endpoints declared in OpenAPI but not found in current backend source | Web target can use the contract once admin auth/RBAC implementation is available; Test Agent runs backend integration checks |
| 2026-07-13 | Frontend Web Agent | Web / Backend / Test Agent | In Progress | In Progress | `frontend/web/index.html`, `frontend/web/styles.css`, `frontend/web/app.js`, `frontend/web/README.md` | `node --check frontend/web/app.js`: Passed; `node frontend/miniprogram/tests/registration.test.js`: Passed; `ruby scripts/validate_workflow.rb`: Passed; static server: `python3 -m http.server 4173 --directory frontend/web` running at `http://localhost:4173` | Admin login/RBAC API is declared in `docs/openapi.yaml` but absent from `backend/src` | Implement and test `/admin/auth/*`, admin sessions/RBAC, then run Web integration and browser accessibility checks |
| 2026-07-13 | Backend Agent | Web / Test Agent | In Progress | In Progress | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `backend/.env.example`, `backend/README.md`, `docs/database.md` | `npm test`: 6 passed; backend JS syntax: Passed; HTTP smoke test on port 3010: `/health` 200 and bootstrap owner login returned token; `ruby scripts/validate_workflow.rb`: Passed | Admin account update UI/API remains outside this bootstrap/login change | Configure local `.env`, run Web against backend, then Test Agent verifies browser review flow |
| 2026-07-14 | Backend Agent | Web / Test Agent | In Progress | In Progress | `backend/src/app.js` | `npm test`: 6 passed; backend JS syntax: Passed; `ruby scripts/validate_workflow.rb`: Passed | Fixed legacy `review_actions.reviewer_user_id` NOT NULL compatibility during admin decisions | Restart backend and retest approve/request-changes in Web platform |
| 2026-07-14 | Frontend MiniProgram Agent | Test Agent | In Progress | In Progress | `frontend/miniprogram/pages/home/home.*`, `frontend/miniprogram/pages/role-home/*`, `frontend/miniprogram/app.json` | Mini Program JS syntax: Passed; `node frontend/miniprogram/tests/registration.test.js`: Passed; `ruby scripts/validate_workflow.rb`: Passed | None | Test approved-identity entry, pending/changes states, and session restoration in WeChat DevTools |
| 2026-07-14 | Backend + Web Agents | Test Agent | In Progress | Blocked | `backend/src/app.js`, `backend/src/db.js`, `frontend/web/index.html`, `frontend/web/app.js`, `frontend/web/styles.css` | `npm test`: 9 passed; Web admin review, account/RBAC, user management and report controls implemented; frontend JS syntax passed; workflow validation passed | Unified Web browser and Mini Program verification pending | Test Agent runs the unified validation batch. |
| 2026-07-14 | Review Agent | Test Agent | Blocked | Blocked | Backend admin RBAC/audit/session code, Web permission workspace, Mini Program session/config code, OpenAPI/database docs | Backend `npm test`: 11 passed; Web permission tests passed; Mini Program scripts/tests passed; delivery report `/tmp/ppfiles-learn-delivery/TASK-20260713-002/20260714-181440-883cc3/report.md` | In-app browser unavailable; WeChat DevTools/real-device checks pending | Run owner/admin/reviewer/operator browser flows and Mini Program session restoration in platform tools. |
| 2026-07-15 | Mini Program + Backend Agent | Test Agent | Blocked | Blocked | `backend/src/app.js`, `backend/test/app.test.js`, `frontend/miniprogram/app.json`, `frontend/miniprogram/app.js`, `frontend/miniprogram/pages/startup/*`, `frontend/miniprogram/pages/register/*` | Phone number is bound to one role; cross-role registration returns `PHONE_ROLE_BOUND`; startup restores session and routes approved users to their role workspace; backend `npm test`: 13 passed; Mini Program JS syntax, registration/session tests passed; runner report `/tmp/ppfiles-learn-delivery/TASK-20260713-002/20260715-121322-34398f/report.md` | WeChat DevTools/real-device authorization and startup routing pending | Test phone authorization, app restart, expired session and cross-role rejection in platform tools. |
| 2026-07-16 | Test Agent | Test Agent | Blocked | Blocked | none (revalidation only) | Backend `npm test` 17 passed covering session/phone/role binding and review; Mini Program registration/session tests passed; `ruby scripts/deliver.rb recruitment-role-registration` passed at `/tmp/ppfiles-learn-delivery/TASK-20260713-002/20260716-103536-e71b8b/report.md` | Real WeChat authorization + browser admin review flows still unavailable here | Run platform browser and DevTools acceptance, then close task. |
| 2026-07-16 | Test Agent | Test Agent / Product Owner | Blocked | Blocked | `tasks/recruitment-role-registration.md` (checklist + evidence sync only) | Revalidation: backend `npm test` 28 passed; Mini Program registration/session passed; Web permissions/moderation passed; workflow passed; `ruby scripts/deliver.rb recruitment-role-registration` passed → `/tmp/ppfiles-learn-delivery/TASK-20260713-002/20260716-160039-f521a1/report.md`. Implementation checklist aligned to Done scopes. | Still cannot run real WeChat auth or interactive browser admin UX here | Product/Test: execute the two remaining platform acceptance items below, attach step evidence, then Test Agent may mark `test: Done` and task `Done`. |
