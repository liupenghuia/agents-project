---
id: TASK-20260701-001
title: User Management
status: Blocked
priority: P2
owner: Test Agent
created: "2026-07-01"
updated: "2026-07-16"
source_idea: null
depends_on: []
linked_issues: []
required_scopes:
  backend: true
  frontend: true
  mobile: false
  ios: false
  android: false
frontend_targets:
  miniprogram: false
  web: true
frontend_target_status:
  miniprogram: N/A
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
blocked_reason: 遗留样例任务；本地自动化与交付 runner 已通过，等待真实浏览器中的管理员权限与用户 CRUD 验收。
blocked_since: "2026-07-14"
unblock_owner: Test Agent
unblock_condition: 在真实浏览器验证用户创建、列表、编辑、停用、重复邮箱和权限失败场景，并记录步骤证据。
---

# Task: User Management

## Origin

- Source idea: None. Legacy sample task created before the product discovery workflow.
- Promotion decision/evidence: Existing documented requirements accepted as the product source.

## Related Documents

- Requirements: `docs/requirements.md`
- Architecture: `docs/architecture.md`
- API: `docs/openapi.yaml`
- Database: `docs/database.md`
- Testing: `docs/testing.md`

## Goal

Implement basic user management so users can be created, viewed, updated, and disabled.

## Scope

In scope:

- List users.
- Create user.
- View user detail.
- Update user name or status.
- Disable user.

Out of scope:

- Authentication.
- Role-based authorization.
- Password management.
- User invitation flow.

## User Stories

- As an admin user, I want to create a user, so that the system can track that user.
- As an admin user, I want to view users, so that I can understand who exists in the system.
- As an admin user, I want to update a user, so that profile data stays accurate.
- As an admin user, I want to disable a user, so that inactive users cannot be treated as active.

## Acceptance Criteria

- [ ] Backend exposes the user endpoints documented in `docs/openapi.yaml`.
- [ ] Backend validates email and name inputs.
- [ ] Backend prevents duplicate emails.
- [ ] Frontend can list users.
- [ ] Frontend can create users.
- [ ] Frontend can update users.
- [ ] Frontend can disable users.
- [ ] Frontend shows loading, empty, success, and error states.
- [ ] Test Agent can verify the workflow using `docs/testing.md`.

## Frontend Work

- [ ] User list view.
- [ ] User create form.
- [ ] User edit form.
- [ ] Disable user action.
- [ ] API integration with documented endpoints.
- [ ] Frontend tests for form validation and main UI states.

## Backend Work

- [ ] `GET /users`.
- [ ] `POST /users`.
- [ ] `GET /users/{userId}`.
- [ ] `PATCH /users/{userId}`.
- [ ] `DELETE /users/{userId}`.
- [ ] Input validation.
- [ ] Duplicate email handling.
- [ ] Backend tests for success and error cases.

## Architecture Checklist

- [x] API contract updated.
- [x] Database design updated.
- [x] Error handling defined.
- [ ] Authentication decision documented before production use.
- [ ] Authorization decision documented before production use.

## Test Plan

- [ ] Backend unit tests for validation.
- [ ] Backend integration tests for user endpoints.
- [ ] Frontend component tests for user forms.
- [ ] End-to-end test for create, update, and disable flow.
- [ ] Regression tests for linked issues.

## Linked Issues

- None

## Client Architecture Pre-Coding Check

- Target/module: Web user-management workspace.
- Existing pattern and owner: Static Web app owns UI orchestration; the shared `request` boundary owns HTTP; backend remains the authorization and validation authority.
- Responsibility and dependency decision: Add editable row state and explicit save/status actions without duplicating email/status business validation in presentation code.
- Shared vs target-specific decision: Role capability mapping is shared across Web workspaces through a pure local module; DOM rendering stays Web-specific.
- State/contract/security impact: Preserve `/users` contracts, show read-only or hidden controls for unauthorized roles, and handle independent loading/error states.
- Verification plan: Pure permission tests, Web JS syntax, backend user integration tests, browser smoke and delivery runner.
- Architecture review: Not required; no framework, contract, authentication or ownership change.

## Handoff Log

| Date | Actor | Target | From | To | Changed files | Evidence/commands | Issues | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-01 | Product Agent | Coordinator | Draft | Ready for Architecture | Requirements/task | Initial feature scope created. | None | Architect review. |
| 2026-07-01 | Architect Agent | Coordinator / Web | Ready for Architecture | Ready for Implementation | API/database contracts | Contracts documented. | None | Backend and Web implementation. |
| 2026-07-14 | Backend + Web Agents | Test Agent | Ready for Implementation | Blocked | `backend/src/db.js`, `backend/src/app.js`, `backend/test/app.test.js`, `frontend/web/index.html`, `frontend/web/app.js`, `frontend/web/styles.css` | `npm test`: 9 passed; Node syntax checks passed; Web user CRUD controls and API integration added; `ruby scripts/validate_workflow.rb`: Passed | Unified browser/admin verification pending | Test Agent runs the unified validation batch. |
| 2026-07-14 | Review Agent | Test Agent | Blocked | Blocked | Owner protection, admin/user session revocation, sanitized audit API/UI, Web role-target controls | Backend `npm test`: 11 passed; Web permission tests and HTTP smoke passed; delivery report `/tmp/ppfiles-learn-delivery/TASK-20260701-001/20260714-181440-1f1b73/report.md` | In-app browser unavailable; responsive/keyboard/admin workflow smoke pending | Run owner/admin account and audit workflows in a real browser. |
| 2026-07-16 | Test Agent | Test Agent | Blocked | Blocked | none (revalidation only) | Backend user management coverage still green under `npm test` (17); `ruby scripts/deliver.rb user-management` passed at `/tmp/ppfiles-learn-delivery/TASK-20260701-001/20260716-103541-ced3ff/report.md` | Real browser admin CRUD/permission smoke still unavailable | Optional low-priority browser acceptance, or Product may Cancel as superseded by recruitment admin flows. |
