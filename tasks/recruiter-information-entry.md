---
id: TASK-20260714-004
title: 招聘者信息填写
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

# 任务：招聘者信息填写

## Origin

- Source idea: `IDEA-20260713-001`
- Promotion decision/evidence: User requested a recruiter information entry point on 2026-07-14.

## Goal

让已有招人身份的用户填写招聘地点和详细地址，为后续发布招聘信息提供可复用的地点资料。

## Users And Assumptions

- Primary user: 已完成招人身份创建的招聘者。
- Assumption: 用户进入页面时已经完成微信登录并拥有招人身份。
- Assumption: “详细地址”需要精确到楼栋，但展示给其他用户的精度和隐私规则由后续产品/架构确认。
- External dependency: WeChat Mini Program location permission and map/geolocation capability.

## Scope

In scope:

- 招聘者信息填写入口。
- 设备地理定位获取位置。
- 详细地址填写，精确到楼栋。
- 查看和修改已保存的招聘者地点信息。
- 定位授权拒绝、手动重试、表单校验、保存成功和失败状态。

Out of scope:

- 企业认证、实名认证和身份证件采集。
- 职位发布、搜索、匹配、投递和审核流程。
- iOS、Android 和 Web 普通用户端。

## User Stories

- As a recruiter, I want to save my hiring location and detailed address, so that later recruitment information can reuse it.
- As a recruiter, I want to retry location access or correct the address, so that the saved location is accurate.

## Acceptance Criteria

- [x] 已登录且拥有招人身份的用户可以进入招聘者信息填写页面。
- [x] 没有招人身份的用户不能直接提交，并能看到进入招人身份创建流程的入口或提示。
- [x] 用户可以发起设备地理定位并看到定位结果或失败原因。
- [x] 用户可以填写详细地址，且提交前必须精确到楼栋。
- [x] 定位授权被拒绝、定位失败或网络失败时，页面保留输入内容并提供重试或手动处理路径。
- [x] 有效信息提交成功后，后端保存且页面显示已保存内容。
- [x] 用户再次进入页面可以查看并修改自己的招聘者地点信息。
- [x] 用户只能查看和修改自己的信息。
- [x] 本任务不新增企业认证、人工审核或职位发布流程。
- [x] Test Agent 可以验证授权、定位失败、提交和重试流程。

## Architecture Impact

- Architecture: Modular monolith; one current `recruiter_information` location record per recruiter identity.
- API: `GET/PUT /me/recruiter/information` with owner-only access, latitude/longitude, and building-level `detailedAddress`.
- Database/migration: Add `recruiter_information` with validated coordinate bounds and a protected detailed address.
- Security/privacy: Require the authenticated recruiter session; precise coordinates and detailed address are owner-only in this MVP.
- Compatibility/versioning: WeChat Mini Program only; iOS, Android, and Web user clients remain out of scope.
- Rollback: New location records can be removed or deprecated without changing recruiter identity records.

## Implementation Checklist

### Backend

- [x] Define and implement authenticated recruiter information API.
- [x] Validate location and detailed address.
- [x] Reject out-of-range or non-finite coordinates.
- [x] Enforce ownership and read/create/update behavior.
- [x] Add unit and integration tests.

### WeChat Mini Program

- [x] Add recruiter information page and navigation.
- [x] Add location permission, positioning, address input, save, edit, failure, and retry states.
- [x] Add component/flow tests.

### Web / Mobile / iOS / Android

- [x] `N/A`: Web is administrator-only in this phase; iOS and Android are not implemented.

## Test Plan

- [x] Location permission accepted and denied.
- [x] Location/network failure and retry.
- [x] Required detailed address validation.
- [x] Create, read, update, reload, and ownership behavior.
- [x] Workflow validation.

## Verification Evidence

| Date | Scope | Command/check | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-14 | Product | `ruby scripts/validate_workflow.rb` | Passed | Product task created with acceptance criteria and required scopes. |

## Release Plan

- Environment/artifact: To be defined by Architect/Test Agent.
- Deployment and smoke test: To be defined; production release is not required for this task.
- Monitoring and rollback: To be defined with the API/database design.

## Known Limitations

- Location provider, coordinate precision, address display privacy, and map SDK require Architect review.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `docs/requirements.md`, `ideas/recruitment-platform.md`, task | `ruby scripts/validate_workflow.rb`: Passed | None | Architect defines location API, storage, privacy, and rollback. |
| 2026-07-14 | Architect Agent | Backend / Mini Program / Test | Ready for Architecture | Ready for Implementation | `docs/architecture.md`, `docs/architecture/adr-002-job-seeking-and-recruitment-information.md`, `docs/database.md`, `docs/openapi.yaml`, task | `ruby scripts/validate_workflow.rb`: Passed; OpenAPI YAML parsed; owner-only `GET/PUT /me/recruiter/information` defined | None | Implement location API, permission flow, persistence, and tests. |
| 2026-07-14 | Backend Agent | Coordinator / Test Agent | In Progress | Ready for Test | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js` | `npm test`: 8 passed; `node --check backend/src/app.js backend/src/db.js`: Passed | None | Test Agent verifies acceptance and platform-specific behavior. |
| 2026-07-14 | Frontend MiniProgram Agent | Coordinator / Test Agent | In Progress | Ready for Test | `frontend/miniprogram/pages/recruiter-information/*`, `services/api.js`, `utils/information.js`, `tests/information.test.js` | `node --check` all Mini Program JS: Passed; information tests: Passed; delivery runner report: `/tmp/ppfiles-learn-delivery/TASK-20260714-004/20260714-111247-2507be/report.md` | WeChat DevTools unavailable | Test Agent must run real Mini Program rendering and location authorization checks. |
| 2026-07-14 | Test Agent | Coordinator | Ready for Test | Blocked | Test evidence and task metadata | Delivery runner passed; required DevTools manual check unavailable | Platform verification blocker | Run the documented DevTools checks, then resume the Test Gate. |
| 2026-07-14 | Review Agent | Test Agent | Blocked | Blocked | Recruiter location validation/API contract and shared backend tests | Backend `npm test`: 11 passed; Mini Program information tests passed; delivery report `/tmp/ppfiles-learn-delivery/TASK-20260714-004/20260714-181439-cfa2d9/report.md` | WeChat DevTools/real-device location authorization checks pending | Run the documented platform checks, then resume the Test Gate. |
| 2026-07-14 | Test Agent | Coordinator | Blocked | Done | DevTools recruiter-information page and isolated backend; screenshot `/tmp/task-004-recruiter-information.png` | DevTools location selection, building-level address validation, submit, saved state and reload passed; failure/retry state inspected; runner report `/tmp/ppfiles-learn-delivery/TASK-20260714-004/20260714-185003-7f637b/report.md` | None | Dependency accepted. |
