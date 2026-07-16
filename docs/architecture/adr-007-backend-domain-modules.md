# ADR-007: Backend Domain Modules And Shared Visibility Policy

## Status

Accepted

## Context

`backend/src/app.js` and `backend/src/db.js` grew into multi-domain monolith files after phase one through three. Documentation already describes modular boundaries, but code physical layout lagged. This increases merge conflict risk, duplicates visibility/block/expiry predicates, and makes contract drift more likely.

## Decision

Keep a **modular monolith** process boundary. Reorganize code into domain modules without changing external HTTP behavior:

```text
backend/src/
  server.js                 # process entry
  app.js                    # createApp composition root
  http.js                   # response, errors, rate limit, body helpers
  wechat.js                 # WeChat adapter
  db.js                     # createDatabase + compatibility re-exports
  domain/
    time.js / visibility.js
    schema.js
    validators.js           # pure HTTP body/query/media/collaboration input validation
    errors.js               # domain code -> HTTP status normalize/rethrow
    auth.js / identity.js   # identity includes create/resubmit/review + DTO mapping
    information.js          # owner information writes + owner DTO mapping
    users.js / market.js / admin.js
    collaboration.js        # write paths use domainError + validators for input checks
    store.js                # re-export facade for domain stores
  routes/
    index.js                # CORS, body parse, domain dispatch, normalizeDomainError
    auth.js / admin.js / users.js / information.js
    market.js / identity.js / collaboration.js
```

### Compatibility

- Existing imports `from './db.js'` and `from './app.js'` remain valid.
- `createDatabase` and `createApp` signatures stay stable.
- No intentional status/body/error-code changes.

### Shared Visibility Policy

`domain/visibility.js` owns:

- publication TTL default and `expires_at` active checks
- SQL fragment for not-expired predicates
- mutual block checks
- “target is publicly actionable” checks used by market detail and collaboration entry points

Market list/map/detail/favorites and collaboration start/apply paths must call this policy rather than re-encoding predicates.

### Collaboration Transactions

Multi-step writes (start conversation + first message, create interview + application status, etc.) run inside a single SQLite transaction with rollback on failure.

### Contracts

OpenAPI and database.md are updated in the same change set as structural sync for already-shipped endpoints (collaboration, renew, totalCount, expiresAt).

## Consequences

- Positive: clearer ownership, less duplicated safety predicates, safer collaboration writes, contracts catch up.
- Negative: more files; temporary re-export surface until older deep imports are cleaned.
- Follow-up: optional deeper DI; move authenticate/admin helpers out of `app.js`; apply `rethrowDomainError` consistently across remaining route modules.

## Rollback

Revert the refactor commit set; schema remains backward compatible because no intentional table drops or renames are introduced beyond already-shipped columns/tables.
