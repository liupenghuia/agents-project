# ADR-003: Two-Sided Information Market, Favorites, And Contact Access

## Status

Accepted

## Context

- Applicants and recruiters need reciprocal browsing of published information in the Mini Program.
- Detail pages must include contact information, while list pages should remain safe for scanning.
- Both sides need persistent favorites, and administrators need a way to respond to reports or disable content.
- Matching, recommendations, chat, and applications are deferred to a later version.

## Decision

Use authenticated, direction-specific list and detail APIs with cursor pagination and newest-publication sorting. Keep contact fields out of list DTOs and return them only from detail endpoints after approved counterpart-identity checks. Use separate favorite relations for applicant-to-recruitment-post and recruiter-to-applicant-information. Add publication timestamps, disable states, contact-view logs, and report records.

## Rationale

1. Explicit lists and filters are predictable, testable, and sufficient for the first version.
2. Direction-specific access checks match the product roles and prevent accidental cross-role writes.
3. Contact details remain available as required while reducing bulk exposure from list endpoints.
4. Publication timestamps make ordering observable and stable.
5. Disable/report operations provide minimum operational control without introducing full moderation queues.

## Trade-offs

- Contact access logs and rate limits add storage and operational work.
- Cursor pagination is less convenient for arbitrary page jumps but remains stable when new records are published.
- Separate favorite tables add schema objects but preserve foreign-key integrity and simpler queries.

## Revisit Trigger

Revisit when recommendation, matching, chat, applications, public map search, contact exchange, or large-scale moderation is introduced.
