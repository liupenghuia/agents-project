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
| reviewer_user_id | string | yes | Authorized reviewer account |
| decision | string | yes | `approved` or `changes_requested` |
| reason | string | conditional | Required for `changes_requested`; recommended for approval notes |
| created_at | datetime | yes | Append-only decision timestamp |

Review actions are never overwritten. The current status on `role_profiles` is a query optimization; the action history is the audit source.

## New Entity: reviewer_permissions

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| user_id | string | yes | Reviewer account |
| permission | string | yes | `identity_review` |
| created_at | datetime | yes | Grant timestamp |

Unique `(user_id, permission)`.

## Indexes

- Primary indexes on every `id`/`role_profile_id`.
- Unique `(auth_accounts.provider, auth_accounts.provider_subject)`.
- Unique `(role_profiles.user_id, role_profiles.role)`.
- Review queue index `(role_profiles.review_status, role_profiles.submitted_at)`.
- Review history index `(review_actions.role_profile_id, review_actions.created_at)`.

## Privacy And Security Rules

- Do not store `session_key` or expose `openid` to the client.
- Hash platform session tokens before persistence.
- Encrypt or otherwise protect contact phone fields at rest and restrict reviewer access.
- Do not store identity documents or real-name verification material in phase one.
- Every reviewer decision must identify the reviewer and be audit logged.
- Retain rejected/changed profiles according to the product retention policy; do not hard-delete without Product and Architect approval.

## Migration Notes

- Existing `users.email` becomes nullable to support WeChat-only accounts; existing user-management APIs continue to require email for their own create flow until Product changes that contract.
- Add the new tables and indexes in one backward-compatible migration before backend implementation.
- Existing user records receive no `auth_accounts` row unless explicitly linked through a supported provider flow.
- Any schema change must update this document before backend implementation starts.
