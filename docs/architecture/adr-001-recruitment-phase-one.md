# ADR-001: Recruitment Phase-One Identity And Review Architecture

## Status

Accepted

## Context

- Phase one targets a WeChat Mini Program only.
- A WeChat user may own both a recruiter and an applicant identity.
- Each identity type is immutable after creation.
- Registration requires manual review, but real-name verification is out of scope.
- The project is an MVP with no stated high-scale or real-time requirement.

## Options Considered

| Decision | Option A | Option B | Choice |
| --- | --- | --- | --- |
| Service shape | Modular monolith | Microservices | Modular monolith |
| Profile storage | Single JSON profile | Normalized role-specific tables | Normalized tables |
| Review processing | Synchronous state machine | Queue/event workflow | Synchronous state machine |
| Login | Self-managed password | WeChat provider-linked session | WeChat session |

## Decision

Use a modular monolith with a provider-linked user account, one immutable recruiter profile and one immutable applicant profile per user, and synchronous manual-review state transitions with append-only review actions.

## Rationale

1. The current scope is CRUD-heavy and benefits from low operational complexity.
2. Typed role profiles make validation and reviewer queries explicit.
3. A unique `(user_id, role)` constraint directly enforces the two-role requirement.
4. Synchronous review is enough until reviewer volume or integrations require a queue.
5. WeChat provider login matches the requested client and avoids a password system in phase one.

## Trade-offs Accepted

- A modular monolith couples deployment of registration and review, which is acceptable for the MVP.
- Normalized tables require migrations when role fields evolve, but prevent unvalidated JSON drift.
- Synchronous review does not provide automatic workload distribution; reviewer volume is a revisit trigger.
- Provider login depends on WeChat availability and policy changes; provider abstraction keeps future providers possible.

## Consequences

- Positive: clear identity ownership, immutable role semantics, auditable review, and simple local testing.
- Negative: an internal reviewer surface and provider integration are required before end-to-end delivery.
- Mitigation: keep reviewer API separate, hash session tokens, audit every decision, and retain provider-neutral account fields.

## Revisit Trigger

Reconsider when additional clients/providers, real-name verification, organizations, multiple identities per role, or high-volume review queues are required.
