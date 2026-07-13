# ADR-001: Recruitment Phase-One Identity And Review Architecture

## Status

Accepted

## Context

- Phase one has a WeChat Mini Program for end users and a protected Web management system for administrators.
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
| End-user login | Self-managed password | WeChat provider-linked session | WeChat session |
| Admin login | Shared/default credentials | Dedicated account password with RBAC | Dedicated admin account |

## Decision

Use a modular monolith with a provider-linked user account, one immutable recruiter profile and one immutable applicant profile per user, and a protected Web Admin Management Module. Administrators use dedicated password-backed accounts with RBAC; identity review is a submodule of that management system and uses synchronous state transitions with append-only review actions.

## Rationale

1. The current scope is CRUD-heavy and benefits from low operational complexity.
2. Typed role profiles make validation and reviewer queries explicit.
3. A unique `(user_id, role)` constraint directly enforces the two-role requirement.
4. Synchronous review is enough until reviewer volume or integrations require a queue.
5. WeChat provider login matches the requested end-user client and avoids a password system for end users.
6. A shared administrator management boundary keeps account, permission, user-management, review, and audit rules consistent.

## Trade-offs Accepted

- A modular monolith couples deployment of registration and review, which is acceptable for the MVP.
- Normalized tables require migrations when role fields evolve, but prevent unvalidated JSON drift.
- Synchronous review does not provide automatic workload distribution; reviewer volume is a revisit trigger.
- Provider login depends on WeChat availability and policy changes; provider abstraction keeps future providers possible.
- Administrator credentials introduce password security and account-recovery responsibilities; Argon2id/bcrypt hashing, secure bootstrap, session revocation, and audit logging mitigate this cost.

## Consequences

- Positive: clear identity ownership, immutable role semantics, auditable review, and simple local testing.
- Negative: a protected administrator surface, password security, and provider integration are required before end-to-end delivery.
- Mitigation: keep reviewer API separate, hash session tokens, audit every decision, and retain provider-neutral account fields.

## Revisit Trigger

Reconsider when additional clients/providers, real-name verification, organizations, multiple identities per role, or high-volume review queues are required.
