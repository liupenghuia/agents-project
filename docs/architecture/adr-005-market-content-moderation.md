# ADR-005: Market Content Moderation State Machine

## Status

Accepted

## Context

- Recruitment posts and applicant job-seeking information currently become public immediately and support only `published` and `disabled`.
- Administrators need one content operations queue for filtering, requesting changes, disabling, approving resubmissions, and restoring disabled content.
- A publisher must be able to understand why content was returned and edit it without exposing returned content to other market users.
- Existing list, detail, favorite, media, and map projections already use the source content status as their visibility boundary.

## Decision

Both market object types use the same status vocabulary:

| Status | Public | Owner behavior | Administrator behavior |
| --- | --- | --- | --- |
| `published` | yes | May edit or disable | May request changes or disable |
| `changes_requested` | no | Sees reason; an edit resubmits to `pending_review` | May disable |
| `pending_review` | no | Sees pending state; further edits remain pending | May approve, request changes, or disable |
| `disabled` | no | May inspect and edit; owner-disabled content may be republished by editing, administrator-disabled content remains disabled | May restore to `published` |

Existing and newly created records retain the current compatibility behavior and start as `published`. Manual review starts only after an administrator requests changes. This avoids silently placing all existing content behind a new queue.

The current status, latest moderation reason, actor, and time are stored on each source record for owner and administrator reads. Every administrator transition is also recorded in append-only `admin_audit_logs`; current columns are a query projection, while the audit log is the history source.

`GET /admin/market-content` returns safe operational summaries and supports target type, status, and publication-time filters. `POST /admin/market-content/{targetType}/{targetId}/decision` accepts `approve`, `request_changes`, `disable`, or `restore`. A reason is mandatory for `request_changes`. Invalid source-state transitions return `409`.

Only active `owner` and `operator` administrator roles may use market-content and report operations. The `admin` role manages users and non-owner administrator accounts; the `reviewer` role manages identity review. Client-side navigation reflects this matrix but never replaces backend authorization.

## Visibility And Compatibility

- Ordinary market list, detail, media, and map APIs return only `published` records.
- Favorite lists keep inaccessible records as status-only owner-private references so the user can remove them, but contacts and media remain unavailable.
- Returned reasons and moderator identities are never exposed to unrelated market viewers.
- Owner DTOs expose `status`, optional `moderationReason`, and optional `moderatedAt`.
- Existing `disabled` rows are treated as owner-disabled because no administrator actor was recorded historically.

## Security

- WeChat sessions cannot access administrator endpoints.
- `admin` and `reviewer` roles receive `403` for market moderation decisions.
- Owner write endpoints enforce role-profile ownership and cannot change another publisher's content.
- Administrator-disabled content cannot be republished by an owner edit; only an authorized restore action can make it public.
- Audit details contain status, decision, and reason only; credentials, sessions, precise coordinates, and contact data are excluded.

## Migration And Rollback

- Add nullable moderation columns and widen status checks without deleting or rewriting source records.
- SQLite tables created by an older schema are rebuilt transactionally when their status `CHECK` constraints do not include the new values.
- Rolling back the UI or moderation endpoints leaves all non-`published` records private. A controlled data migration is required before rolling back code if pending or returned records must be published again.
- The Web content module can be hidden without changing public market behavior.

## Revisit Triggers

- Mandatory pre-publication review for every new item.
- Appeals, notifications, batch decisions, reason templates, or service-level queues.
- A dedicated policy engine or more granular administrator permissions.
