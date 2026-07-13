# Database Design

## Overview

The MVP keeps a provider-neutral `users` account separate from provider credentials and role-specific profiles. One user can own at most one recruiter profile and one applicant profile.

Database columns use `snake_case`; API fields use `camelCase`.

## Existing Entity: users

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| email | string | no | Nullable for WeChat-only accounts; existing managed-user creation still validates email when required |
| name | string | yes | Internal/default display name; role profiles hold role-specific display values |
| status | string | yes | `active` or `disabled` |
| created_at | datetime | yes | Creation timestamp |
| updated_at | datetime | yes | Last update timestamp |

## New Entity: auth_accounts

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| user_id | string | yes | Foreign key to `users.id` |
| provider | string | yes | `wechat` in phase one |
| provider_subject | string | yes | Server-side WeChat subject identifier; never returned to clients |
| union_id | string | no | Optional WeChat union identifier if available and permitted |
| created_at | datetime | yes | First link time |
| last_login_at | datetime | yes | Last successful session exchange |

Constraints:

- Unique `(provider, provider_subject)`.
- One user may have multiple providers in future, but phase one creates only `wechat`.

## New Entity: sessions

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| user_id | string | yes | Foreign key to `users.id` |
| token_hash | string | yes | Hash of platform session token; raw token is never persisted |
| expires_at | datetime | yes | Expiry time |
| revoked_at | datetime | no | Set on logout or security invalidation |
| created_at | datetime | yes | Session creation time |

Indexes:

- Index `(user_id, expires_at)`.
- Index `token_hash` with a uniqueness constraint.

## New Entity: role_profiles

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Identity profile primary key |
| user_id | string | yes | Foreign key to `users.id` |
| role | string | yes | Immutable enum: `recruiter` or `applicant` |
| review_status | string | yes | `pending_review`, `approved`, or `changes_requested` |
| submitted_at | datetime | yes | Latest submission time |
| reviewed_at | datetime | no | Latest review time |
| review_reason | string | no | Required when status is `changes_requested` |
| created_at | datetime | yes | Creation timestamp |
| updated_at | datetime | yes | Last update timestamp |

Constraints:

- Unique `(user_id, role)`; this allows both roles but prevents duplicate profiles of one role.
- `role` cannot be updated after insert.
- A profile can be resubmitted only from `changes_requested` to `pending_review`.
- A new profile always starts as `pending_review`.

## New Entity: recruiter_profiles

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| role_profile_id | string | yes | Primary/foreign key to `role_profiles.id`; role must be `recruiter` |
| organization_name | string | yes | Company, individual, or hiring主体 name |
| organization_type | string | yes | `company`, `individual`, or `other` |
| contact_name | string | yes | Contact display name |
| contact_phone | string | yes | Authorized contact number; protect at rest |
| region | string | yes | Hiring location |
| industry_or_job_direction | string | yes | Main industry or hiring direction |
| created_at | datetime | yes | Creation timestamp |
| updated_at | datetime | yes | Last update timestamp |

## New Entity: applicant_profiles

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| role_profile_id | string | yes | Primary/foreign key to `role_profiles.id`; role must be `applicant` |
| display_name | string | yes | Name or platform display name |
| contact_phone | string | yes | Authorized contact number; protect at rest |
| region | string | yes | Current or preferred region |
| desired_job | string | yes | Desired position or job type |
| experience_summary | string | yes | Short work experience summary |
| preferred_region_or_time | string | yes | Work location or availability preference |
| created_at | datetime | yes | Creation timestamp |
| updated_at | datetime | yes | Last update timestamp |

## New Entity: review_actions

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| role_profile_id | string | yes | Reviewed profile |
| admin_user_id | string | yes | Authorized administrator account |
| decision | string | yes | `approved` or `changes_requested` |
| reason | string | conditional | Required for `changes_requested`; recommended for approval notes |
| created_at | datetime | yes | Append-only decision timestamp |

Review actions are never overwritten. The current status on `role_profiles` is a query optimization; the action history is the audit source.

## New Entity: admin_accounts

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| user_id | string | yes | Primary/foreign key to `users.id`; administrator identity |
| login_name | string | yes | Unique administrator login identifier |
| password_hash | string | yes | Argon2id/bcrypt hash; plaintext password is never stored |
| status | string | yes | `active` or `disabled` |
| last_login_at | datetime | no | Last successful admin login |
| created_by | string | no | Administrator user id that created this account |
| created_at | datetime | yes | Account creation time |
| updated_at | datetime | yes | Last account or password change |

Constraints:

- Unique `login_name` and `user_id`.
- Admin credentials are separate from WeChat provider credentials.
- Disabled admin accounts cannot log in or use existing admin sessions.
- The initial `owner` account is created only by a one-time secure bootstrap flow.

## New Entity: admin_roles

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| user_id | string | yes | Primary/foreign key to `admin_accounts.user_id` |
| role | string | yes | `owner`, `admin`, `reviewer`, or `operator` |
| assigned_by | string | yes | Administrator who assigned the role |
| created_at | datetime | yes | Assignment time |

Constraints:

- One active role per administrator in phase one.
- Only `owner` can assign or change administrator roles.
- At least one active `owner` must remain; the last active owner cannot be disabled, deleted, or demoted.

## New Entity: admin_sessions

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| user_id | string | yes | Foreign key to `admin_accounts.user_id` |
| token_hash | string | yes | Hash of opaque admin session token; raw token is never persisted |
| expires_at | datetime | yes | Session expiry |
| revoked_at | datetime | no | Set on logout or security invalidation |
| created_at | datetime | yes | Session creation time |

Constraints:

- Unique `token_hash`.
- Disabled administrator accounts cannot use active sessions.
- Admin sessions are separate from WeChat `sessions`.

The effective permission set is defined by the role matrix in `docs/architecture.md`; it is not accepted from client input.

## Indexes

- Primary indexes on every `id`/`role_profile_id`.
- Unique `(auth_accounts.provider, auth_accounts.provider_subject)`.
- Unique `(role_profiles.user_id, role_profiles.role)`.
- Review queue index `(role_profiles.review_status, role_profiles.submitted_at)`.
- Review history index `(review_actions.role_profile_id, review_actions.created_at)`.
- Unique `admin_accounts.login_name`.
- Admin account index `(admin_accounts.status, admin_accounts.created_at)`.
- Admin session index `(admin_sessions.user_id, admin_sessions.expires_at)`.

## Privacy And Security Rules

- Do not store `session_key` or expose `openid` to the client.
- Hash platform session tokens before persistence.
- Encrypt or otherwise protect contact phone fields at rest and restrict reviewer access.
- Do not store identity documents or real-name verification material in phase one.
- Every admin login, password/role/account change, user management action, and review decision must identify the administrator and be audit logged.
- Administrator credentials must use a password hash and must never be returned by an API.
- Retain rejected/changed profiles according to the product retention policy; do not hard-delete without Product and Architect approval.

## Migration Notes

- Existing `users.email` becomes nullable to support WeChat-only accounts; existing user-management APIs continue to require email for their own create flow until Product changes that contract.
- Add the new tables and indexes in one backward-compatible migration before backend implementation.
- Existing user records receive no `auth_accounts` row unless explicitly linked through a supported provider flow.
- Any schema change must update this document before backend implementation starts.
