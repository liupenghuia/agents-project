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

## New Entity: applicant_job_seeking_information

One current record belongs to each applicant role profile. Updates replace the current values and do not create a review action.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| role_profile_id | string | yes | Primary/foreign key to `role_profiles.id`; role must be `applicant` |
| job_type_name | string | yes | Desired work type/name |
| age | integer | yes | Whole-number age; initial API validation range is 1-120 |
| expected_salary | string | yes | MVP display/input value; structured salary is deferred |
| work_method | string | yes | `monthly_settlement` or `indefinite_duration` |
| location_text | string | yes | User-entered or user-confirmed location text |
| latitude | decimal | yes | User-confirmed latitude |
| longitude | decimal | yes | User-confirmed longitude |
| preferred_work_scope | string | no | Secondary optional preference |
| visibility_status | string | yes | `published`, `pending_review`, `changes_requested`, or `disabled` |
| published_at | datetime | yes | First publication time; returned as `publishedAt` |
| expires_at | datetime | yes | Public-market expiry; default publish time + 30 days; renewed by owner |
| disabled_at | datetime | no | Owner/admin disable time |
| moderation_reason | string | no | Latest administrator return/disable reason; owner/admin only |
| moderated_by | string | no | Latest administrator actor; foreign key to `admin_accounts.user_id` |
| moderated_at | datetime | no | Latest administrator action time |
| created_at | datetime | yes | First save time |
| updated_at | datetime | yes | Last update time |

Constraints:

- Unique `role_profile_id`.
- New submitted information starts as `published` and receives `published_at`; only `published` and non-expired information is included in public market queries.
- Editing `changes_requested` information transitions it to `pending_review`; editing an administrator-disabled row does not make it public.
- The referenced role profile must belong to the authenticated user for API access.
- Coordinates must be finite and within latitude `[-90, 90]` and longitude `[-180, 180]`.

## New Entity: recruiter_information

One current location record belongs to each recruiter role profile.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| role_profile_id | string | yes | Primary/foreign key to `role_profiles.id`; role must be `recruiter` |
| latitude | decimal | yes | Device/user-confirmed latitude |
| longitude | decimal | yes | Device/user-confirmed longitude |
| detailed_address | string | yes | Address required to building-level precision |
| created_at | datetime | yes | First save time |
| updated_at | datetime | yes | Last update time |

Constraints:

- Unique `role_profile_id`.
- Precise coordinates and detailed address are owner-readable and owner-writable only in the MVP.

## New Entity: recruitment_posts

One recruiter may own multiple recruitment posts. A successful submission creates a `published` record; the owner may later set it to `disabled`.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| recruiter_role_profile_id | string | yes | Foreign key to `role_profiles.id`; role must be `recruiter` |
| job_type | string | yes | Published work type |
| salary_range | string | yes | MVP display/input value; structured range is deferred |
| settlement_method | string | yes | Product field; exact allowed values require follow-up |
| location_text | string | yes | User-confirmed display location |
| latitude | decimal | yes | Required submitted latitude |
| longitude | decimal | yes | Required submitted longitude |
| status | string | yes | `published`, `pending_review`, `changes_requested`, or `disabled` |
| published_at | datetime | yes | Publication time; returned as `publishedAt` |
| expires_at | datetime | yes | Public-market expiry; default publish time + 30 days; renewed by owner |
| disabled_at | datetime | no | Owner/admin disable time |
| moderation_reason | string | no | Latest administrator return/disable reason; owner/admin only |
| moderated_by | string | no | Latest administrator actor; foreign key to `admin_accounts.user_id` |
| moderated_at | datetime | no | Latest administrator action time |
| created_at | datetime | yes | Creation time |
| updated_at | datetime | yes | Last update time |

Constraints:

- Coordinates must be finite and within latitude `[-90, 90]` and longitude `[-180, 180]`.
- Only the owning recruiter may read or update the post through the MVP owner APIs.
- Public precise-location responses are not defined by this task.
- `published_at` is required for every published post and is the default list sort key.
- Editing a `changes_requested` post transitions it to `pending_review`; editing an administrator-disabled post preserves `disabled` until an authorized restore.

## New Entity: recruitment_post_images

Images are stored in object storage; the database keeps ownership and upload metadata.

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| recruitment_post_id | string | yes | Foreign key to `recruitment_posts.id` |
| object_key | string | yes | Server-issued object-storage key; never an arbitrary client URL |
| content_type | string | yes | Allowlisted image MIME type |
| byte_size | integer | yes | Validated upload size |
| sort_order | integer | yes | Display order starting at 0 |
| created_at | datetime | yes | Upload reference creation time |

Constraints:

- Maximum six rows per recruitment post.
- Unique `(recruitment_post_id, sort_order)` and `(recruitment_post_id, object_key)`.
- Upload references must be owned by the current user and unexpired at publish time.
- Owner APIs may return `object_key`; market APIs return only random image `id`, content type, sort order, and `/market/media/{imageId}`.
- Public media lookup succeeds only while the parent post is published and its recruiter identity is approved.

## New Entity: media_uploads

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| object_key | string | yes | Primary key; server-issued storage key |
| user_id | string | yes | Upload owner |
| content_type | string | yes | Allowlisted image MIME type |
| byte_size | integer | yes | Declared maximum upload size |
| expires_at | datetime | yes | Upload reference expiry |
| completed_at | datetime | no | Set after the binary upload succeeds |
| created_at | datetime | yes | Reference creation time |

Constraints:

- Only the owning authenticated user may complete an upload.
- Expired or already-completed references cannot be reused.
- Completion verifies the binary signature against `content_type` and replaces `byte_size` with the actual stored size.
- Unclaimed references are eligible for cleanup after expiry.

## New Entity: applicant_favorites

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| applicant_role_profile_id | string | yes | Applicant identity that owns the favorite |
| recruitment_post_id | string | yes | Favorited recruitment post |
| created_at | datetime | yes | Favorite creation time |

Constraints:

- Unique `(applicant_role_profile_id, recruitment_post_id)`.
- Disabled or deleted posts remain referentially visible to the owner list as unavailable, but cannot expose contact details.

## New Entity: recruiter_favorites

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| recruiter_role_profile_id | string | yes | Recruiter identity that owns the favorite |
| applicant_information_role_profile_id | string | yes | Favorited applicant information owner |
| created_at | datetime | yes | Favorite creation time |

Constraints:

- Unique `(recruiter_role_profile_id, applicant_information_role_profile_id)`.
- Disabled applicant information cannot expose contact details.

## New Entity: market_contact_views

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| viewer_user_id | string | yes | Authenticated viewer |
| target_type | string | yes | `recruitment_post` or `applicant_information` |
| target_id | string | yes | Market object identifier |
| created_at | datetime | yes | Contact detail access time |

Contact view logs are append-only and are rate-limit input; they are not returned to ordinary users.

## New Entity: market_reports

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| reporter_user_id | string | yes | Authenticated reporter |
| target_type | string | yes | `recruitment_post` or `applicant_information` |
| target_id | string | yes | Reported market object |
| reason | string | yes | User-provided report reason |
| status | string | yes | `open`, `resolved`, or `rejected` |
| resolved_by | string | no | Admin user who resolved the report |
| resolved_at | datetime | no | Resolution time |
| created_at | datetime | yes | Report submission time |

Reports are immutable submissions; only resolution fields change through protected admin operations.

## Market Moderation Projection

The two source content tables store the current moderation projection. `admin_audit_logs` remains the append-only history source for administrator actions.

| Field | Required | Notes |
| --- | --- | --- |
| status / visibility_status | yes | Shared content state vocabulary |
| moderation_reason | no | Required for `changes_requested`; cleared on approve/restore |
| moderated_by | no | Administrator actor for the latest moderation action; null for owner-only disable |
| moderated_at | no | Latest moderation action time |

Allowed administrator transitions are `published -> changes_requested|disabled`, `pending_review -> published|changes_requested|disabled`, `changes_requested -> disabled`, and `disabled -> published`. Owner edits perform `changes_requested -> pending_review`; owner-disabled legacy/current rows may return to `published`, but rows with `moderated_by` remain disabled. Public list, detail, media, and map queries filter on `published` before projection or aggregation.

## New Entity: market_user_blocks

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Random opaque block identifier exposed only to the blocker |
| blocker_user_id | string | yes | Authenticated user who owns the relation |
| blocked_user_id | string | yes | Resolved market owner; never exposed to clients |
| target_role | string | yes | `recruiter` or `applicant`, used for safe list display |
| created_at | datetime | yes | Block creation time |

Constraints: unique `(blocker_user_id, blocked_user_id)`, blocker and blocked user must differ, and delete operations match both `id` and current `blocker_user_id`. Market list, detail, map and favorite queries exclude owners in this table before returning data or computing clusters.

## Market Map Projection

The first version does not add a map-specific source table. Map results are generated from `recruitment_posts` and `applicant_job_seeking_information` after the same published/visibility, approved-counterpart, moderation, and viewer-blocklist predicates used by market lists.

| Projection field | Source/derivation | Public |
| --- | --- | --- |
| id | Recruitment post ID or applicant role-profile ID | Single point only |
| cluster | `true` when multiple eligible records share a grid cell | yes |
| count | Number of eligible records in the grid cell | Cluster only |
| latitude/longitude | Deterministic grid-cell center or approved regional display point | Approximate only |
| published_at | Source record `published_at` | yes |
| summary fields | Same safe fields as the direction-specific market list | yes |

The stored source `latitude` and `longitude` are never returned by map endpoints to ordinary users. The grid precision is derived from the requested zoom and is not persisted. The backend must cap viewport span, zoom, cell count, and result count. If map query volume later requires a spatial index, a derived index can be introduced without changing the projection DTO or source publication records.

## New Entity: admin_accounts

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| user_id | string | yes | Primary/foreign key to `users.id`; administrator identity |
| login_name | string | yes | Unique administrator login identifier |
| password_hash | string | yes | Memory-hard password hash (`scrypt` in the current implementation); plaintext is never stored |
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

## New Entity: admin_audit_logs

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| admin_user_id | string | yes | Administrator who performed the action |
| action | string | yes | Stable action identifier such as `admin.account.updated` |
| target_type | string | yes | Audited resource type |
| target_id | string | no | Audited resource identifier when available |
| details_json | JSON text | yes | Sanitized metadata; never contains passwords, raw tokens, or secrets |
| created_at | datetime | yes | Append-only action timestamp |

Successful administrator login, account and role changes, user changes, review decisions, and report decisions write owner-readable audit rows.

## Indexes

- Primary indexes on every `id`/`role_profile_id`.
- Unique `(auth_accounts.provider, auth_accounts.provider_subject)`.
- Unique `(role_profiles.user_id, role_profiles.role)`.
- Review queue index `(role_profiles.review_status, role_profiles.submitted_at)`.
- Review history index `(review_actions.role_profile_id, review_actions.created_at)`.
- Unique `applicant_job_seeking_information.role_profile_id`.
- Unique `recruiter_information.role_profile_id`.
- Recruitment post index `(recruitment_posts.recruiter_role_profile_id, recruitment_posts.status, recruitment_posts.created_at)`.
- Recruitment image index `(recruitment_post_images.recruitment_post_id, recruitment_post_images.sort_order)`.
- Media upload cleanup index `(media_uploads.user_id, media_uploads.expires_at)`.
- Market publication index `(recruitment_posts.status, recruitment_posts.published_at, recruitment_posts.id)`.
- Applicant publication index `(applicant_job_seeking_information.visibility_status, applicant_job_seeking_information.published_at, applicant_job_seeking_information.role_profile_id)`.
- Favorite lookup indexes on both viewer identity columns and target columns.
- Contact view index `(market_contact_views.viewer_user_id, market_contact_views.created_at)`.
- Report queue index `(market_reports.status, market_reports.created_at)`.
- Unique `admin_accounts.login_name`.
- Admin account index `(admin_accounts.status, admin_accounts.created_at)`.
- Admin session index `(admin_sessions.user_id, admin_sessions.expires_at)`.
- Admin audit indexes `(admin_audit_logs.created_at, admin_audit_logs.id)` and `(admin_audit_logs.admin_user_id, admin_audit_logs.created_at)`.

## New Entity: conversations / messages / applications / interviews

Collaboration tables support in-app messaging, applications, and interviews after approved counterpart identities exist.

### conversations

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| initiator_user_id | string | yes | User who first opened the conversation |
| peer_user_id | string | yes | Counterparty user |
| related_target_type | string | yes | `recruitment_post` or `applicant_information` |
| related_target_id | string | yes | Target publication id |
| status | string | yes | `active`, `ended`, or `blocked` |
| created_at | datetime | yes | Creation time |
| updated_at | datetime | yes | Last activity time |

Unique `(initiator_user_id, peer_user_id, related_target_type, related_target_id)`.

### messages

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| conversation_id | string | yes | Foreign key to conversations |
| sender_user_id | string | yes | Sender |
| body | string | yes | Text only; max 1000 |
| client_request_id | string | no | Client idempotency key |
| created_at | datetime | yes | Send time |

Partial unique index on `(conversation_id, sender_user_id, client_request_id)` when `client_request_id` is not null.

### applications

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| applicant_user_id | string | yes | Applicant platform user |
| recruitment_post_id | string | yes | Target post |
| status | string | yes | `submitted`, `viewed`, `contacted`, `interviewing`, `hired`, `rejected`, `withdrawn`, `closed` |
| note | string | no | Optional applicant note |
| created_at | datetime | yes | Creation time |
| updated_at | datetime | yes | Last status change |

Unique `(applicant_user_id, recruitment_post_id)` for idempotent apply.

### interviews

| Column | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Primary key |
| application_id | string | no | Optional linked application |
| recruiter_user_id | string | yes | Inviting recruiter |
| applicant_user_id | string | yes | Invitee |
| scheduled_at | datetime | yes | Interview time |
| location_text | string | yes | Location summary (not precise building address) |
| status | string | yes | `invited`, `accepted`, `declined`, `cancelled`, `completed` |
| cancel_reason | string | no | Required when cancelled |
| created_at | datetime | yes | Creation time |
| updated_at | datetime | yes | Last change |

### collaboration_audits

Append-only security/operation audit for conversation, message, application, and interview actions.

## Privacy And Security Rules

- Do not store `session_key` or expose `openid` to the client.
- Hash platform session tokens before persistence.
- Encrypt or otherwise protect contact phone fields at rest and restrict reviewer access.
- Do not store identity documents or real-name verification material in phase one.
- Every admin login, password/role/account change, user management action, and review decision must identify the administrator and be audit logged.
- Administrator credentials must use a password hash and must never be returned by an API.
- Store image binaries only in object storage and expire unclaimed upload references.
- Do not expose precise coordinates or detailed addresses in public responses until product and privacy rules define display precision.
- Contact fields are excluded from market lists and returned only from approved, authenticated detail requests; every detail contact read is logged.
- Disabled content is excluded from market lists and detail contact responses.
- Expired publications (`expires_at <= now`) are excluded from public list/map/detail contact and treated as unavailable in favorites; expiry is enforced server-side via the shared visibility policy.
- Retain rejected/changed profiles according to the product retention policy; do not hard-delete without Product and Architect approval.

## Migration Notes

- Existing `users.email` becomes nullable to support WeChat-only accounts; existing user-management APIs continue to require email for their own create flow until Product changes that contract.
- Add the new tables and indexes in one backward-compatible migration before backend implementation.
- Add `applicant_job_seeking_information`, `recruiter_information`, `recruitment_posts`, and `recruitment_post_images` in a backward-compatible migration; existing role profile rows receive no child record until the user submits information.
- Add publication status/timestamps to applicant and recruitment records, plus favorite, contact-view, and report tables in a backward-compatible migration.
- Add `admin_audit_logs` and stable market pagination indexes in a backward-compatible migration before enabling the reviewed administrator and market endpoints.
- Backfill `recruitment_posts.published_at` from `created_at` for existing published rows; existing applicant information receives `published_at = updated_at` and `visibility_status = published` only after the owner publication rule is confirmed.
- Use a local filesystem/object-storage adapter in development and a managed object-storage provider in deployment; the API must keep the object key abstraction stable.
- Existing user records receive no `auth_accounts` row unless explicitly linked through a supported provider flow.
- Any schema change must update this document before backend implementation starts.
