---
id: TASK-20260714-003
title: 求职端上传求职信息
status: Done
priority: P1
owner: Architect Agent
created: "2026-07-14"
updated: "2026-07-14"
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

# 任务：求职端上传求职信息

## Origin

- Source idea: `IDEA-20260713-001`
- Promotion decision/evidence: User requested a personal information page for the applicant side on 2026-07-14.

## Goal

让已有应聘身份的用户在小程序个人信息页面填写并提交最小求职信息，后续可以查看和修改自己的信息。

## Users And Assumptions

- Primary user: 已完成应聘身份创建的求职者。
- Assumption: 用户进入页面时已经完成微信登录并拥有应聘身份；没有应聘身份时应引导其先完成应聘身份创建。
- Assumption: 本任务的“提交”表示保存求职信息，不新增人工审核流程。
- External dependency: Existing WeChat session and applicant identity APIs.

## Scope

In scope:

- 求职端个人信息页面。
- 填写、查看和修改自己的求职信息。
- 工种名。
- 年龄。
- 期望薪资。
- 工作方式：月结、不定时长。
- 位置信息，供后续功能使用。
- 期望工作范围，作为次要可选信息。
- 表单校验、重复提交保护、保存成功、失败和重试状态。

Out of scope:

- 职位搜索、匹配、推荐、投递、沟通、面试和录用。
- 简历文件、身份证明、实名认证和企业认证。
- 求职信息人工审核，除非后续产品决策明确增加。
- iOS、Android 和 Web 普通用户端。

## User Stories

- As an applicant, I want to fill in my job-seeking information, so that the platform knows what work I am looking for.
- As an applicant, I want to edit my submitted information, so that it remains current.

## Acceptance Criteria

- [x] 已登录且拥有应聘身份的用户可以进入求职端个人信息页面。
- [x] 没有应聘身份的用户不能直接提交求职信息，并能看到前往应聘身份创建流程的入口或提示。
- [x] 页面展示工种名、年龄、期望薪资、工作方式、位置信息和期望工作范围字段。
- [x] 工种名、年龄、期望薪资、工作方式和位置信息为必填；期望工作范围为可选。
- [x] 工作方式只能选择“月结”或“不定时长”。
- [x] 必填信息不完整或格式无效时不能提交，并显示明确错误。
- [x] 有效信息提交成功后，后端保存且页面显示成功状态和已保存内容。
- [x] 用户再次进入页面可以看到自己的已保存信息，并可以修改后重新提交。
- [x] 提交期间禁止重复提交；网络失败或服务错误时保留已填写内容并提供重试。
- [x] 用户只能查看和修改自己的求职信息。
- [x] 本任务不引入人工审核、职位搜索、匹配或投递流程。
- [x] Test Agent 可以验证小程序、后端和主要异常流程。

## Architecture Impact

- Architecture: Modular monolith; one current `applicant_job_seeking_information` record per applicant identity.
- API: `GET/PUT /me/applicant/job-seeking-information` with owner-only access, required age/job/salary/work method/location, and fixed work-method enum.
- Database/migration: Add `applicant_job_seeking_information`; store latitude/longitude with validated bounds and keep salary as an MVP string until structured matching is designed.
- Security/privacy: Require the authenticated applicant session and enforce ownership; precise location is not public in this MVP.
- Compatibility/versioning: WeChat Mini Program only; iOS, Android, and Web user clients remain out of scope.
- Rollback: New child records can be hidden or removed through a backward-compatible migration; existing applicant identity data remains intact.

## Implementation Checklist

### Backend

- [x] Define and implement the applicant job-seeking information API.
- [x] Validate required fields and work method enum.
- [x] Validate age and coordinate bounds.
- [x] Enforce one information record per applicant identity and ownership checks.
- [x] Support read, create, and update behavior.
- [x] Add unit and integration tests.

### WeChat Mini Program

- [x] Add personal information page and navigation from the applicant experience.
- [x] Add field validation and submission states.
- [x] Load existing information for editing.
- [x] Handle no applicant identity, loading, success, failure, timeout, and retry states.
- [x] Add component/flow tests.

### Web / Mobile / iOS / Android

- [x] `N/A`: Web is administrator-only in this phase; iOS and Android are not implemented.

## Test Plan

- [x] Required and optional field validation.
- [x] Work method enum validation.
- [x] Create, read, update, and reload behavior.
- [x] Ownership and unauthenticated access rejection.
- [x] Duplicate submission prevention and retry after failure.
- [x] Mini Program UI and navigation states.
- [x] Regression and workflow validation.

## Verification Evidence

| Date | Scope | Command/check | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-14 | Product | `ruby scripts/validate_workflow.rb` | Passed | Product task created with acceptance criteria and required scopes. |

## Release Plan

- Environment/artifact: To be defined by Architect/Test Agent.
- Deployment and smoke test: To be defined; production release is not required for this task.
- Monitoring and rollback: To be defined with the API/database design.

## Known Limitations

- Exact salary format, age validation range, and location structure require Architect/API review.
- Whether submitted job-seeking information should later enter manual review remains a product follow-up decision.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `docs/requirements.md`, `ideas/recruitment-platform.md`, task | `ruby scripts/validate_workflow.rb`: Passed | None | Architect defines API, database, security, and rollback details. |
| 2026-07-14 | Architect Agent | Backend / Mini Program / Test | Ready for Architecture | Ready for Implementation | `docs/architecture.md`, `docs/architecture/adr-002-job-seeking-and-recruitment-information.md`, `docs/database.md`, `docs/openapi.yaml`, task | `ruby scripts/validate_workflow.rb`: Passed; OpenAPI YAML parsed; owner-only `GET/PUT /me/applicant/job-seeking-information` defined | None | Implement API, migration, Mini Program page, and tests. |
| 2026-07-14 | Backend Agent | Coordinator / Test Agent | In Progress | Ready for Test | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js` | `npm test`: 8 passed; `node --check backend/src/app.js backend/src/db.js`: Passed | None | Test Agent verifies acceptance and platform-specific behavior. |
| 2026-07-14 | Frontend MiniProgram Agent | Coordinator / Test Agent | In Progress | Ready for Test | `frontend/miniprogram/pages/applicant-information/*`, `services/api.js`, `utils/information.js`, `tests/information.test.js` | `node --check` all Mini Program JS: Passed; registration/information tests: Passed; delivery runner report: `/tmp/ppfiles-learn-delivery/TASK-20260714-003/20260714-111247-8c68c0/report.md` | WeChat DevTools unavailable | Test Agent must run real Mini Program rendering and location authorization checks. |
| 2026-07-14 | Test Agent | Coordinator | Ready for Test | Blocked | Test evidence and task metadata | Delivery runner passed; required DevTools manual check unavailable | Platform verification blocker | Run the documented DevTools checks, then resume the Test Gate. |
| 2026-07-14 | Review Agent | Test Agent | Blocked | Blocked | Applicant validation/API contract and shared backend tests | Backend `npm test`: 11 passed; Mini Program information tests passed; delivery report `/tmp/ppfiles-learn-delivery/TASK-20260714-003/20260714-181439-acb8d6/report.md` | WeChat DevTools/real-device form and location checks pending | Run the documented platform checks, then resume the Test Gate. |
| 2026-07-14 | Test Agent | Coordinator | Blocked | Done | DevTools applicant page and isolated backend; screenshot `/tmp/task-003-applicant-information.png` | DevTools location selection, required fields, submit, saved state, reload/backfill and owner disable/republish passed; backend tests passed; runner report `/tmp/ppfiles-learn-delivery/TASK-20260714-003/20260714-185003-123742/report.md` | None | Dependency accepted. |
