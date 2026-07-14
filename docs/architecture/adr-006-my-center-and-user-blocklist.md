# ADR-006: Mini Program Workspace Navigation And Private User Blocklist

## Status

Accepted

## Decision

The Mini Program exposes three persistent workspace destinations: map, list, and my center. Map and list remain two modes of the existing market page so filters, viewport, pagination, and detail ownership stay in one state owner. My center is a separate page. The market page saves role-scoped workspace state before navigation and restores it on return.

Blocking is user-scoped rather than content-scoped. A viewer blocks the owner resolved from a `recruitment_post` or `applicant_information` target. The client submits only target type and market object ID; it never receives the target's internal user ID. The blocklist response exposes a random `blockId`, safe display label, target role, and creation time. Unblocking uses `blockId` and enforces viewer ownership.

Public list, map, detail, media eligibility, and favorites apply the same `NOT EXISTS` block predicate before projection or aggregation. A blocked owner therefore contributes neither records nor cluster counts. Existing favorites are retained but hidden while blocked and reappear after unblock.

My center composes existing identity, publication, and favorite endpoints with the new blocklist endpoint. No duplicate aggregate source of truth is introduced. Approved users may update fields on their own identity profile through an owner-only profile endpoint; role and review state are immutable through that endpoint.

## Security And Privacy

- Block relations are visible only to the blocking user.
- Self-blocking and blocking an unavailable target are rejected.
- A blocked target is not informed and cannot infer the relation through another user's responses.
- Profile updates verify identity ownership and reject role/review-state fields.
- Contact, exact coordinates, provider identifiers, and internal user IDs are absent from blocklist DTOs.

## Migration And Rollback

Add `market_user_blocks(id, blocker_user_id, blocked_user_id, target_role, created_at)` with unique blocker/blocked user pairs and indexes for both directions. Existing market records need no rewrite. The block UI can be hidden while preserving rows; removing the query predicate requires an explicit product rollback decision because hidden records would become visible again.
