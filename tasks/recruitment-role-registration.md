---
id: TASK-20260713-002
title: 招聘平台角色选择与注册审核
status: In Progress
priority: P1
owner: Architect Agent
created: "2026-07-13"
updated: "2026-07-13"
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
  web: In Progress
scope_status:
  product: Done
  architecture: Done
  backend: Done
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

# 任务：招聘平台角色选择与注册审核

## Origin

- Source idea: `IDEA-20260713-001`
- Promotion decision/evidence: 用户确认第一阶段只做微信小程序、角色选择、双身份注册和人工审核。

## Goal

让新用户在微信小程序中选择“招人”或“应聘”，完成对应身份的注册资料提交；注册身份类型不可直接转换，但同一微信用户可以分别拥有两种身份。提交后进入人工审核，审核状态清晰可见。

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
- 同一微信用户分别创建两种身份。
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
- [ ] 同一微信用户可以分别创建招人方和应聘方身份。
- [ ] 已创建的身份类型不能直接转换；创建另一种身份必须走另一套身份注册流程。
- [ ] 注册资料提交成功后，身份状态为“待人工审核”，用户不能误以为已审核通过。
- [ ] 审核人员可以查看注册资料并设置“通过”或“拒绝/需修改”，拒绝结果包含可展示给用户的原因。
- [ ] 用户再次进入小程序时可以看到已有身份及各自审核状态。
- [ ] 已审核通过的身份进入对应端入口；待审核和拒绝/需修改身份进入状态处理页。
- [ ] 重复提交、授权取消、授权失败、网络失败和服务错误都有明确提示和可恢复操作。
- [ ] 第一阶段不采集实名认证材料、不做企业认证，并且产品页面不暗示已完成身份认证。
- [ ] 测试 Agent 可以验证两个角色、双身份、不可转换、审核状态和主要异常流程。

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

- [ ] Aggregate frontend coordination and cross-target API decisions.

### WeChat Mini Program

- [x] 微信小程序双入口首页。
- [x] 招人方注册表单。
- [x] 应聘方注册表单。
- [x] 双身份入口和不可转换提示。
- [x] 微信授权、隐私、表单、提交、审核状态和异常页面。
- [ ] 管理后台审核入口与身份状态处理。
- [ ] 小程序组件和流程测试。

### Web Management System

- [ ] 管理员登录和会话管理。
- [ ] 管理员账号创建、禁用、密码变更和角色分配。
- [ ] `owner`、`admin`、`reviewer`、`operator` 权限规则。
- [ ] 身份审核队列、审核状态、拒绝原因和审核操作。
- [ ] 权限变更、账号变更和审核操作审计日志。
- [ ] Web 权限、审核状态、拒绝原因和审核操作测试。

### Shared Mobile / iOS / Android

- [ ] `N/A`：第一阶段只交付微信小程序。

## Test Plan

- [ ] 角色入口和未选择角色保护。
- [ ] 两类注册字段、校验和提交。
- [ ] 同一微信用户创建两种身份。
- [ ] 身份不可直接转换。
- [ ] 待审核、通过、拒绝/需修改状态。
- [ ] 授权取消、重复提交、网络失败和恢复。
- [ ] 回归测试和工作流校验。

## Verification Evidence

| Date | Scope | Command/check | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-13 | Product | `ruby scripts/validate_workflow.rb` | Passed | Product Brief promoted and task linked |

## Release Plan

- Environment/artifact: 待定义。
- Deployment and smoke test: 待 Architect/Test Agent 定义。
- Monitoring and rollback: 待定义。

## Known Limitations

- 微信授权具体组合、审核时限和修改次数需要运营评审；审核操作入口已纳入实施门禁。
- 最小注册字段仍需经过原型和产品评审冻结。

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13 | Product Agent | Coordinator | Draft | Ready for Architecture | `ideas/recruitment-platform.md`, task | `IDEA-20260713-001` promoted | None | Architect defines contracts and data model |
| 2026-07-13 | Architect Agent | Coordinator / Mini Program / Web | Ready for Architecture | Ready for Implementation | Architecture, OpenAPI, database, frontend target rules | `ruby scripts/validate_workflow.rb`; OpenAPI parsed | None | Backend, Mini Program, and Web agents implement scopes |
| 2026-07-13 | Frontend MiniProgram Agent | Coordinator / Test Agent | Ready for Implementation | In Progress | `frontend/miniprogram/app.*`, `pages/home/*`, `pages/register/*`, `pages/identities/*`, `services/api.js`, `utils/registration.js`, `tests/registration.test.js` | `node --check` for all Mini Program JS: Passed; `node frontend/miniprogram/tests/registration.test.js`: Passed; `ruby scripts/validate_workflow.rb`: Passed. WeChat DevTools render/authorization manual check: Not run, tool unavailable. | No issue created; runtime verification remains | Web target and backend continue; Test Agent runs Mini Program UI/flow checks |
| 2026-07-13 | Backend Agent | Backend | Pending | Done | `backend/package.json`, `backend/src/*`, `backend/test/app.test.js`, `backend/README.md`, `docs/openapi.yaml` | `npm test`: 5 passed; `node --check src/app.js`; `node --check src/db.js src/wechat.js src/server.js`; phone contract and client call verified | Admin Web endpoints declared in OpenAPI but not found in current backend source | Web target can use the contract once admin auth/RBAC implementation is available; Test Agent runs backend integration checks |
| 2026-07-13 | Frontend Web Agent | Web / Backend / Test Agent | In Progress | In Progress | `frontend/web/index.html`, `frontend/web/styles.css`, `frontend/web/app.js`, `frontend/web/README.md` | `node --check frontend/web/app.js`: Passed; `node frontend/miniprogram/tests/registration.test.js`: Passed; `ruby scripts/validate_workflow.rb`: Passed; static server: `python3 -m http.server 4173 --directory frontend/web` running at `http://localhost:4173` | Admin login/RBAC API is declared in `docs/openapi.yaml` but absent from `backend/src` | Implement and test `/admin/auth/*`, admin sessions/RBAC, then run Web integration and browser accessibility checks |
| 2026-07-13 | Backend Agent | Web / Test Agent | In Progress | In Progress | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `backend/.env.example`, `backend/README.md`, `docs/database.md` | `npm test`: 6 passed; backend JS syntax: Passed; HTTP smoke test on port 3010: `/health` 200 and bootstrap owner login returned token; `ruby scripts/validate_workflow.rb`: Passed | Admin account update UI/API remains outside this bootstrap/login change | Configure local `.env`, run Web against backend, then Test Agent verifies browser review flow |
