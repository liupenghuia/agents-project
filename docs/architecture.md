# Architecture

## Architecture Style

Use a modular monolith with a REST API:

- `frontend/` owns the WeChat Mini Program UI, client state, navigation, and API integration for phase one.
- `backend/` owns WeChat session exchange, account/identity rules, validation, persistence, administrator authorization, review operations, and audit records.
- `frontend/web/` is the protected management system for administrator accounts, permissions, user management, and identity review; manual review must not depend on direct database edits.
- `ideas/` owns Product Briefs and product decisions.
- `docs/openapi.yaml` is the client/backend contract.
- `docs/database.md` is the data model and migration contract.
- `docs/delivery-workflow.md` defines transitions, quality gates, blockers, and recovery.

## Product Flow

```text
WeChat Mini Program
  -> exchange wx.login code for platform session
  -> list existing identities
  -> choose 招人 or 应聘
  -> submit role-specific profile
  -> pending_review
  -> reviewer approves or requests changes
  -> approved identity enters its role experience
```

The same platform user may have one recruiter identity, one applicant identity, or both. A role profile's `role` is immutable. Creating the other role creates a separate profile; it does not convert the existing profile.

## Module Boundaries

### WeChat Session Module

- Exchanges a short-lived WeChat login code on the backend.
- Stores provider subject identifiers server-side; never exposes `openid` or `session_key` to the client.
- Issues a platform session token and supports expiry/revocation.

### Frontend Targets

- `frontend/miniprogram/` owns WeChat Mini Program pages, lifecycle, authorization/privacy prompts, role selection, registration, and user-facing review states.
- `frontend/web/` owns browser workflows, including the protected reviewer operations surface when a task requires it.
- Target agents share the OpenAPI client contract but do not share platform-specific UI code.
- A task may require one or both targets; `frontend_targets` and `frontend_target_status` are the source of delivery scope.

### User And Identity Module

- Owns the platform user account and provider link.
- Enforces at most one `recruiter` and one `applicant` profile per user.
- Enforces immutable role type and prevents duplicate submissions for the same role.
- Returns only the profile fields allowed by the contract.

### Registration Module

- Validates role-specific minimum fields.
- Creates a profile in `pending_review` in one transaction.
- Allows resubmission only for `changes_requested`, preserving prior review actions.

### Review Module

- Belongs to the protected Admin Management Module and exposes the identity review queue and decisions.
- Allows `pending_review` to become `approved` or `changes_requested`.
- Requires a reason for `changes_requested`.
- Records administrator, decision, reason, and timestamp in an append-only review history.

### Admin Management Module

- Owns administrator account creation, password login, account status, role assignment, and permission checks.
- Uses RBAC roles: `owner`, `admin`, `reviewer`, and `operator`.
- `owner` is the initial maximum-permission role and can manage all administrator, user, permission, and review operations.
- `admin` manages users and administrator accounts but cannot change the final `owner` protection rules.
- `reviewer` can view review queues and approve or request changes for identities.
- `operator` can view permitted operational data but cannot assign permissions or make review decisions.
- The first `owner` account is created through a one-time deployment/bootstrap flow; credentials are never hardcoded or committed.
- At least one active `owner` must remain. An owner cannot delete or disable the last active owner account.
- Administrator password changes, role changes, account disabling, and review decisions are audit logged.

## Decisions And Trade-offs

Significant decisions are recorded in [ADR-001](/Users/Penguin/Documents/PPFiles_Learn/agents-project/docs/architecture/adr-001-recruitment-phase-one.md).

- Modular monolith over microservices: the first phase is CRUD-heavy, low scale, and needs fast iteration.
- REST over event-driven workflows: registration and review are synchronous; audit history is sufficient until throughput or integration requires events.
- Normalized role tables over one polymorphic JSON profile: role-specific validation, reviewer queries, and future migrations need typed fields.
- Provider-linked account over password registration: the requested client is a WeChat Mini Program and the product excludes self-managed passwords in phase one.
- One protected Web management system for permissions and review: these operations share administrator identity, authorization, and audit requirements.

## API Boundaries

- Client endpoints use `/auth`, `/me`, and `/me/identities`.
- Admin endpoints use `/admin` and require an administrator session plus the permission required by each operation.
- Administrator authentication uses a separate password-backed admin session; WeChat users cannot access admin endpoints merely by being authenticated in the Mini Program.
- `/admin/identity-reviews` is the review area inside the management system, not a separate reviewer product.
- `docs/openapi.yaml` defines request/response shapes, error codes, and status enums.
- Backend must reject undocumented fields where strict validation is available and must never return provider secrets.

## State Rules

| Entity | Allowed states | Rules |
| --- | --- | --- |
| Identity profile | `pending_review`, `approved`, `changes_requested` | Role immutable; `changes_requested` may resubmit to `pending_review`. |
| Review action | `approved`, `changes_requested` | Append-only; a reason is required for changes. |
| Session | active, expired, revoked | Expired/revoked sessions cannot access identity endpoints. |
| Admin session | active, expired, revoked | Separate from WeChat sessions; disabled administrators lose access. |

## Security And Privacy

- Backend exchanges WeChat codes; the client never receives `session_key` or `openid`.
- Store provider subjects, session token hashes, and contact data with least privilege and encryption appropriate to deployment.
- Do not collect real-name documents or claim identity verification in phase one.
- Consent screens and privacy policy links must follow current WeChat Mini Program rules.
- Admin login, account/permission changes, user management, and review decisions require explicit authorization and must be audit logged.
- The initial maximum-permission account is the user-provided `owner` account created during secure bootstrap; no default password is allowed.
- Rate-limit login-code exchange, registration submission, resubmission, and review decisions.

## Revisit Triggers

Revisit this architecture when:

- iOS/Android or web clients are added.
- A second identity per role or organization membership is required.
- Reviewer volume requires queues, notifications, or event-driven processing.
- Registration fields require a compatibility/versioning strategy.
- Identity or business flows introduce real-name verification or regulated data.
