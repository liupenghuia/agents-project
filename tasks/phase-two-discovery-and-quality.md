---
id: TASK-20260715-013
title: 第二优先级搜索匹配与发布质量
status: Done
priority: P2
owner: Test Agent
created: "2026-07-15"
updated: "2026-07-15"
source_idea: IDEA-20260713-001
depends_on:
  - TASK-20260715-012
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

# 任务：第二优先级搜索匹配与发布质量

## Product Decision

在核心市场闭环稳定后，提高用户找到合适信息的效率，并降低低质量、过期和重复发布。

## Scope

- 增强搜索和筛选：薪资区间、地区、距离、工作方式、发布时间、图片、状态和筛选结果计数。
- 保存最近搜索和用户主动保存的筛选条件；用户可删除，不做后台推荐。
- 基于工种、地区、薪资、工作方式和距离的规则型匹配；展示匹配原因，不引入黑盒推荐。
- 发布预览、草稿、图片压缩/数量校验、敏感信息提示、重复内容提示和招聘有效期。
- 信息过期后从公开市场隐藏，发布者可续期或重新发布。

## Non-goals

- AI 推荐、自动投递、复杂排序、企业认证、付费置顶和商业化。

## Product Flow

### Search And Filter

1. 用户进入地图或列表。
2. 打开筛选面板，组合工种、薪资、地区、距离、工作方式、发布时间和信息状态。
3. 点击应用后展示已选条件、结果数量和清晰的无结果原因。
4. 地图、列表和匹配结果使用相同条件；重置后清空游标并恢复默认排序。

### Explainable Matching

1. 系统读取用户主动填写的岗位、薪资、工作方式和地区偏好。
2. 对公开信息执行规则匹配，不使用敏感信息或隐藏排序因素。
3. 展示匹配原因，例如“工种相符”“位置相近”“薪资范围接近”。
4. 用户可以忽略匹配结果并继续使用普通列表，不被强制推荐。

### Publish Quality

1. 发布者填写信息并实时获得字段、图片、地址和敏感内容提示。
2. 发布者可以预览、保存草稿、继续编辑或提交。
3. 提交后的信息进入既有发布/审核状态机。
4. 到达有效期后自动从公开地图、列表、详情联系方式和收藏中失效。
5. 发布者可以续期或重新发布，重新发布必须重新校验内容。

## State And Error Requirements

- Filter: `idle`, `editing`, `applying`, `applied`, `empty`, `error`。
- Draft: `unsaved`, `saved`, `submitting`, `submitted`, `expired`。
- Matching: `unavailable`, `calculating`, `ready`, `empty`, `error`。
- Expiry must be server-enforced; client display is informational only.
- Sensitive content warnings must not reveal the exact detection rule in a way that helps bypass moderation.
- Repeated save, submit, renew and filter actions must be idempotent or explicitly blocked while pending.

## Product Metrics

- 筛选应用成功率和筛选后详情进入率。
- 无结果后的条件调整率。
- 匹配结果点击率与用户主动关闭匹配比例。
- 草稿恢复和草稿提交成功率。
- 过期信息被及时隐藏的比例，目标为 100%。
- 重复、敏感和无效发布的拦截率。

## Acceptance Criteria

- [x] 用户可组合筛选条件、看到生效条件和结果数量，清空后恢复默认结果。
- [x] 地图、列表和规则匹配使用一致的发布状态、隐私和拉黑过滤。
- [x] 匹配结果说明至少一个可理解的匹配原因。
- [x] 发布者可以预览、保存草稿、继续编辑和删除草稿。
- [x] 图片和文本校验在提交前反馈，敏感联系方式和精确地址有提示。
- [x] 过期信息自动从公开列表、地图、详情联系方式和收藏中失效。
- [x] 所有新增状态覆盖加载、空、错误、重试、权限和重复提交。

## Known Limitations

- 距离半径筛选未单独提供滑块控件，当前位置仍通过地图视口表达；后续可增强。
- 微信 DevTools 视觉验收未运行。

## Client Architecture Pre-Coding Check

- Existing owner: market API owns query semantics; Mini Program market page owns filter presentation; posting pages own draft/preview state.
- Decision: normalize filters in the client and keep matching/publish expiry rules in backend/domain code.
- Security: contact and precise location remain excluded from matching/list projections; expiry is server-enforced.
- Verification: query contract tests, state transition tests, draft/preview tests and Mini Program flow tests.
- Architecture review: Completed; reuse existing market/post modules.

## Architecture Defaults

- Publication TTL default: 30 days from publish/renew.
- `expires_at` is server-enforced in list/map/detail/favorite projections.
- Renew endpoints: `POST /me/recruitment-posts/{id}/renew`, `POST /me/applicant/job-seeking-information/renew`.
- List responses include `totalCount` for applied filters.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15 | Product Agent | Architect Agent | Draft | Ready for Architecture | task, `docs/requirements.md` | Search/filter efficiency, explainable rule matching, drafts, preview and expiry prioritized after core closure | Matching thresholds and expiry default need implementation defaults | Architect defines contract and sequence |
| 2026-07-15 | Architect Agent | Backend / Mini Program / Test Agent | Ready for Architecture | Ready for Implementation | task | Reuses market/post boundaries and adds no new client platform | Depends on TASK-012 completion gate | Implement search/filter contract first, then matching and publish quality |
| 2026-07-15 | Backend / Mini Program Agent | Test Agent | Ready for Implementation | Ready for Test | `backend/src/app.js`, `backend/src/db.js`, `backend/test/app.test.js`, `frontend/miniprogram/pages/market/*`, `pages/recruitment-post/*`, `utils/information.js`, `utils/matching.js`, `services/api.js` | Added date filters, totalCount, saved/recent filters, matching reasons, draft preview/delete, sensitive hints, server expiry + renew | DevTools visual pending | Test Agent acceptance |
| 2026-07-15 | Test Agent | — | Ready for Test | Done | task | `npm test` 15 pass including expiry/renew; Mini Program tests pass; `ruby scripts/deliver.rb phase-two-discovery-and-quality` Passed (`/tmp/ppfiles-learn-delivery/TASK-20260715-013/20260715-163016-e21458/report.md`) | None | Proceed to TASK-20260715-014 |
