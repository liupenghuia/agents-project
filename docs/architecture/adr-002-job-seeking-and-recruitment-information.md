# ADR-002: Applicant Information, Recruiter Location, And Recruitment Posts

## Status

Accepted

## Context

- The next Mini Program features collect applicant job-seeking information and recruiter hiring information.
- The MVP has no public search, matching, application, or chat workflow.
- Precise locations and uploaded images introduce privacy, ownership, and storage concerns.
- The existing system is a low-scale modular monolith with a REST contract and SQLite-compatible development persistence.

## Options Considered

| Decision | Option A | Option B | Choice |
| --- | --- | --- | --- |
| Applicant record | Multiple history records | One current record per applicant identity | One current record |
| Recruitment records | One record per recruiter | Multiple posts per recruiter | Multiple posts |
| Image storage | Database blobs | Object-storage references | Object-storage references |
| Image upload | Arbitrary client URLs | Backend-authorized upload references | Authorized references |
| Location exposure | Public precise address | Owner-only precise location in MVP | Owner-only |

## Decision

Use one owner-managed applicant job-seeking record, one owner-managed recruiter location record, and multiple recruiter-owned recruitment posts. Persist latitude/longitude and detailed addresses as protected fields. Store images outside the relational database and accept only backend-issued upload references, with a maximum of six images per post.

## Rationale

1. One current record matches the personal-information-page workflow and keeps editing idempotent.
2. Multiple recruitment posts preserve the natural future job-posting model without overwriting prior posts.
3. Object storage is appropriate for binary media and keeps transactional rows small.
4. Server-issued upload references prevent arbitrary URL injection and let the backend enforce content type, size, ownership, and expiry.
5. Precise location is needed for the requested flow but should not become public data before product and privacy rules define the display precision.

## Trade-offs

- A staged upload flow adds an external storage dependency and cleanup of abandoned uploads.
- A plain salary string is easy for MVP input but is weaker for future matching; structured salary fields require a later product decision.
- Owner-only location access means public recruitment browsing will need a separate contract and privacy review.

## Consequences

- Positive: clear ownership, idempotent personal information updates, bounded image count, and a migration path to public search.
- Negative: upload lifecycle and location privacy require explicit backend tests and operational cleanup.
- Mitigation: expire unused upload references, validate every reference at publish time, and keep precise location out of public response schemas.

## Revisit Trigger

Revisit when public job browsing, map search, location-based matching, moderation, structured salary filtering, or high-volume media storage is introduced.
