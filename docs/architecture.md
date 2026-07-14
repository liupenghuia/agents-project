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

### Applicant Job-Seeking Information Module

- Belongs to the authenticated applicant identity and stores one current job-seeking information record per applicant identity.
- Requires `job_type_name`, `age`, `expected_salary`, `work_method`, and `location`; `preferred_work_scope` is optional.
- `work_method` is the fixed enum `monthly_settlement` or `indefinite_duration`.
- Applicant information is owner-readable and owner-writable only; it is not publicly exposed by these MVP endpoints.
- Submission saves the current record immediately and does not enter the identity manual-review state machine.
- A submitted applicant record receives `published_at` and is market-visible while its visibility status is `published`; the market module owns public DTO and contact access rules.

### Recruiter Information Module

- Belongs to the authenticated recruiter identity and stores one current hiring-location record per recruiter identity.
- The Mini Program may request device location permission and must send user-confirmed coordinates plus a detailed address accurate to the building.
- Precise coordinates and detailed addresses are sensitive owner data and must not be exposed to unrelated users.

### Recruitment Posting Module

- Allows one recruiter identity to own multiple recruitment posts.
- A post is saved atomically with its job, salary, settlement, location, and image references and becomes `published` after a successful submit with a required `published_at`; it can later be `disabled` by its owner or an authorized administrator.
- A post location stores user-confirmed display text plus latitude and longitude. Public exposure of the precise address is deferred until a separate product decision.
- Images use object-storage references, not database blobs. Uploads are authorized by the backend, limited to six per post, and validated for type and size before publishing.
- No manual review, matching, application, or public search is introduced by these MVP tasks.

### Two-Sided Information Market Module

- Provides two authenticated read directions: applicants browse published recruitment posts; recruiters browse published applicant job-seeking information.
- Lists return safe summary cards only, use cursor pagination, default to newest `published_at`, and support explicit filters rather than recommendation scoring.
- Detail endpoints return the required contact information only after the viewer has an authenticated, approved counterpart identity. Contact information is not returned by list endpoints.
- Public responses use dedicated market DTOs and never expose precise building addresses, provider subjects, session data, or internal account identifiers.
- `published_at` is required for both market object types and is immutable for the current publication unless a future republish rule is defined.

### Favorites Module

- Applicants may favorite recruitment posts; recruiters may favorite applicant job-seeking information.
- Favorite relationships are idempotent and unique per viewer identity/target; removal is explicit and synchronized across devices.
- Disabled or unavailable targets remain labeled as unavailable in the owner's favorites list and cannot reveal contact information.

### Market Safety And Operations Module

- Owners can disable their own published information.
- Authenticated users can report a market object; protected admin operations can disable reported content and resolve reports.
- Contact-detail reads are append-only logged and rate-limited; this is an access safeguard, not a substitute for consent or platform policy.

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
- Current-user information boundaries over generic user IDs: ownership checks are simpler and prevent cross-account reads and writes.
- Object-storage image references over database blobs: image payloads do not inflate transactional database records and can move to a managed provider later.
- Explicit list/filter/detail over recommendation logic: the first market version needs predictable retrieval and can add ranking after usage evidence.
- Separate favorite relation tables over a polymorphic favorite table: database foreign keys and direction-specific permissions remain explicit.
- Authenticated detail contact access over list-level contact exposure: contact is required by product, while list scraping risk is reduced.

## API Boundaries

- Client endpoints use `/auth`, `/me`, and `/me/identities`.
- Admin endpoints use `/admin` and require an administrator session plus the permission required by each operation.
- Administrator authentication uses a separate password-backed admin session; WeChat users cannot access admin endpoints merely by being authenticated in the Mini Program.
- `/admin/identity-reviews` is the review area inside the management system, not a separate reviewer product.
- Applicant endpoints use `/me/applicant/job-seeking-information`; recruiter location endpoints use `/me/recruiter/information`; recruitment posts use `/me/recruitment-posts`.
- Recruitment image upload uses a backend-authorized upload-reference flow; clients submit only server-issued object keys, never arbitrary URLs.
- Market endpoints use `/market/recruitment-posts` and `/market/job-seeking-information`; owner favorites use `/me/favorites/recruitment-posts` and `/me/favorites/job-seeking-information`.
- Owner operations use `/me/market-reports` for reports and protected `/admin/market-reports` operations for resolution/disable actions.
- `docs/openapi.yaml` defines request/response shapes, error codes, and status enums.
- Backend must reject undocumented fields where strict validation is available and must never return provider secrets.

## State Rules

| Entity | Allowed states | Rules |
| --- | --- | --- |
| Identity profile | `pending_review`, `approved`, `changes_requested` | Role immutable; `changes_requested` may resubmit to `pending_review`. |
| Review action | `approved`, `changes_requested` | Append-only; a reason is required for changes. |
| Session | active, expired, revoked | Expired/revoked sessions cannot access identity endpoints. |
| Admin session | active, expired, revoked | Separate from WeChat sessions; disabled administrators lose access. |
| Recruitment post | `published`, `disabled` | Owner may edit a published post or disable it; no review transition in MVP. |
| Applicant market information | `published`, `disabled` | Submitted information is visible to approved recruiters only while published. |
| Market report | `open`, `resolved`, `rejected` | Reports are immutable submissions; admin resolution is recorded separately. |

## Security And Privacy

- Backend exchanges WeChat codes; the client never receives `session_key` or `openid`.
- Store provider subjects, session token hashes, and contact data with least privilege and encryption appropriate to deployment.
- Do not collect real-name documents or claim identity verification in phase one.
- Consent screens and privacy policy links must follow current WeChat Mini Program rules.
- Admin login, account/permission changes, user management, and review decisions require explicit authorization and must be audit logged.
- The initial maximum-permission account is the user-provided `owner` account created during secure bootstrap; no default password is allowed.
- Location coordinates, detailed addresses, and image object keys are validated and access-controlled; precise location is not public by default.
- The backend must reject client-supplied image URLs and accept only server-issued upload references.
- Market list endpoints must exclude disabled objects and contact fields; market detail endpoints must enforce approved counterpart identity and record contact access.
- Admin disabling must immediately remove an object from market queries and revoke contact visibility.
- Rate-limit login-code exchange, registration submission, resubmission, and review decisions.

## Revisit Triggers

Revisit this architecture when:

- iOS/Android or web clients are added.
- A second identity per role or organization membership is required.
- Reviewer volume requires queues, notifications, or event-driven processing.
- Registration fields require a compatibility/versioning strategy.
- Identity or business flows introduce real-name verification or regulated data.
