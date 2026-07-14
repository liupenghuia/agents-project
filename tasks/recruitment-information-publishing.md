---
id: TASK-20260714-005
title: 发布招聘信息
status: Blocked
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
  test: Blocked
  release: N/A
release_required: false
blocked_reason: 微信 DevTools 不可用，无法完成真实小程序渲染、定位授权、图片选择和上传交互验证。
blocked_since: "2026-07-14"
unblock_owner: Test Agent
unblock_condition: 在微信 DevTools 中完成招聘信息页面渲染、定位授权、经纬度提交、图片选择/删除、上传和失败重试验证。
---

# 任务：发布招聘信息

## Origin

- Source idea: `IDEA-20260713-001`
- Promotion decision/evidence: User requested a recruitment information publishing entry point on 2026-07-14.

## Goal

让已有招人身份的用户填写并提交一条最小招聘信息，保存工种、薪资、结算、地点、经纬度和招聘图片。

## Users And Assumptions

- Primary user: 已完成招人身份创建的招聘者。
- Assumption: 用户进入页面时已经完成微信登录并拥有招人身份。
- Assumption: 本任务的“发布”表示保存并提交招聘信息，不新增人工审核流程。
- External dependency: WeChat Mini Program location permission and image selection/upload capability.

## Scope

In scope:

- 招聘信息发布入口。
- 工种。
- 薪资范围。
- 结算方式。
- 位置信息：先获取设备地理位置，再填写/确认位置，并提交经纬度。
- 图片上传，最多六张。
- 查看、编辑和重新提交自己的招聘信息。
- 校验、上传进度、成功、失败、重试和防重复提交状态。

Out of scope:

- 职位搜索、匹配、推荐、投递、沟通、面试和录用。
- 企业认证、实名认证和身份证件采集。
- 招聘信息人工审核，除非后续产品决策明确增加。
- iOS、Android 和 Web 普通用户端。

## User Stories

- As a recruiter, I want to publish a recruitment information record, so that applicants can later understand the opportunity.
- As a recruiter, I want to include an accurate location and images, so that the information is useful for later recruitment features.

## Acceptance Criteria

- [ ] 已登录且拥有招人身份的用户可以进入招聘信息发布页面。
- [ ] 没有招人身份的用户不能直接发布，并能看到进入招人身份创建流程的入口或提示。
- [ ] 页面展示工种、薪资范围、结算方式、位置和图片字段。
- [ ] 发布前先获取设备地理位置；用户确认或填写位置后，提交请求必须包含经纬度。
- [ ] 图片数量不得超过六张，用户可以查看、删除和重新选择图片。
- [ ] 必填信息不完整、位置无效或图片上传失败时不能完成发布，并显示明确错误。
- [ ] 发布成功后后端保存信息和图片引用，页面显示成功状态及已保存内容。
- [ ] 用户再次进入可以查看和编辑自己的招聘信息，并能重新提交。
- [ ] 提交期间禁止重复提交；定位、上传或网络失败时保留已填写内容并提供重试。
- [ ] 用户只能查看和修改自己的招聘信息。
- [ ] 本任务不引入人工审核、搜索、匹配或投递流程。
- [ ] Test Agent 可以验证定位、经纬度、图片上限、上传失败和主要异常流程。

## Architecture Impact

- Architecture: Modular monolith; one recruiter identity can own multiple `recruitment_posts`.
- API: `POST/GET /me/recruitment-posts`, `GET/PATCH /me/recruitment-posts/{postId}`, and backend-authorized `POST /me/recruitment-posts/image-upload-url`.
- Database/migration: Add `recruitment_posts` and `recruitment_post_images`; image binaries stay in object storage and rows keep server-issued keys and metadata.
- Security/privacy: Require the authenticated recruiter session, enforce ownership, validate coordinates and image type/size, cap images at six, and keep precise location out of public responses.
- Compatibility/versioning: WeChat Mini Program only; iOS, Android, and Web user clients remain out of scope.
- Rollback: Posts can be set to `disabled`; image references can be detached or cleaned up without deleting the recruiter identity.

## Implementation Checklist

### Backend

- [x] Define and implement recruitment information API.
- [x] Validate fields, coordinates, image count, image type, and image size.
- [x] Validate that image keys were issued for the current user and have not expired.
- [x] Implement secure image upload/storage references.
- [x] Enforce ownership and create/read/update behavior.
- [x] Add unit and integration tests.

### WeChat Mini Program

- [x] Add recruitment publishing page and navigation.
- [x] Add location permission, coordinate submission, image selection/removal, upload progress, save, edit, failure, and retry states.
- [x] Add component/flow tests.

### Web / Mobile / iOS / Android

- [ ] `N/A`: Web is administrator-only in this phase; iOS and Android are not implemented.

## Test Plan

- [ ] Required field and salary range validation.
- [ ] Settlement method validation.
- [ ] Location permission, coordinate presence, and invalid-coordinate rejection.
- [ ] Zero-to-six image behavior, deletion, type/size rejection, and upload failure retry.
- [ ] Create, read, update, reload, and ownership behavior.
- [ ] Duplicate submission prevention and network recovery.
- [ ] Workflow validation.

## Verification Evidence

| Date | Scope | Command/check | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-07-14 | Product | `ruby scripts/validate_workflow.rb` | Passed | Product task created with acceptance criteria and required scopes. |

## Release Plan

- Environment/artifact: To be defined by Architect/Test Agent.
- Deployment and smoke test: To be defined; production release is not required for this task.
- Monitoring and rollback: To be defined with the API/database design.

## Known Limitations

- Salary format, settlement options, location provider, image rules, storage, address display privacy, and review policy require Architect/Product follow-up.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14 | Product Agent | Architect | Draft | Ready for Architecture | `docs/requirements.md`, `ideas/recruitment-platform.md`, task | `ruby scripts/validate_workflow.rb`: Passed | None | Architect defines publishing API, image storage, location security, and rollback. |
| 2026-07-14 | Architect Agent | Backend / Mini Program / Test | Ready for Architecture | Ready for Implementation | `docs/architecture.md`, `docs/architecture/adr-002-job-seeking-and-recruitment-information.md`, `docs/database.md`, `docs/openapi.yaml`, task | `ruby scripts/validate_workflow.rb`: Passed; OpenAPI YAML parsed; owner-only post APIs and six-image upload cap defined | None | Implement post API, upload adapter, Mini Program page, and tests. |
| 2026-07-14 | Backend Agent | Coordinator / Test Agent | In Progress | Ready for Test | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js` | `npm test`: 8 passed; upload-reference integration passed; `node --check backend/src/app.js backend/src/db.js`: Passed | None | Test Agent verifies acceptance and platform-specific behavior. |
| 2026-07-14 | Frontend MiniProgram Agent | Coordinator / Test Agent | In Progress | Ready for Test | `frontend/miniprogram/pages/recruitment-post/*`, `services/api.js`, `utils/information.js`, `tests/information.test.js` | `node --check` all Mini Program JS: Passed; information tests: Passed; delivery runner report: `/tmp/ppfiles-learn-delivery/TASK-20260714-005/20260714-111247-62f246/report.md` | WeChat DevTools unavailable | Test Agent must run real Mini Program rendering, location, image and upload checks. |
| 2026-07-14 | Test Agent | Coordinator | Ready for Test | Blocked | Test evidence and task metadata | Delivery runner passed; required DevTools manual check unavailable | Platform verification blocker | Run the documented DevTools checks, then resume the Test Gate. |
