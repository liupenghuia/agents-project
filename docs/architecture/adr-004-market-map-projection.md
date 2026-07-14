# ADR-004: Privacy-Safe Market Map Projection And Grid Aggregation

## Status

Accepted

## Context

- Applicants need to find recruitment posts by area; recruiters need to find applicant information by area.
- The existing market records already store user-confirmed latitude and longitude for owner workflows.
- The product requires map markers, zooming, clustering, and marker-to-detail navigation.
- Exact coordinates and building-level addresses must not be exposed to unrelated users.
- The phase-one system is a low-scale modular monolith with a WeChat Mini Program and no approved map search service or high-volume geospatial database.

## Options Considered

| Option | Advantages | Costs/Risks | Decision |
| --- | --- | --- | --- |
| Client-only markers and clustering | Simple API and responsive UI | Leaks raw coordinates; cannot consistently apply moderation, blocklists, or authorization | Rejected |
| Dedicated GIS/search service | Strong geo queries and mature clustering | New service, cost, operations, migration and privacy boundary for MVP | Deferred |
| Backend deterministic grid projection | Reuses SQLite data, centralizes privacy and filters, predictable output | Approximate positions; grid quality needs tuning at zoom levels | Chosen |

## Decision

Use backend-generated privacy-safe map projections over the existing market records. Each query accepts a bounded viewport, zoom, direction-specific filters, and a capped limit. The backend filters for the authenticated approved counterpart identity, published visibility, moderation state, and viewer blocklist before grouping records into deterministic grid cells.

At low zoom, one response item represents a cell and contains `cluster=true`, a cell display coordinate, and `count`. At high zoom, a cell with one eligible record may return `cluster=false` and a privacy display coordinate; the raw stored coordinate is never returned. A cluster tap causes the Mini Program to zoom into the cluster bounds and query again. A single-point tap navigates to the existing market detail endpoint.

The map endpoint returns safe summary fields only. Contact data, precise coordinates, detailed addresses, image object keys, and internal role/profile identifiers are excluded. The list and map endpoints share the same visibility and filter semantics; map results are a visual projection, not a second market data model.

## Rationale

1. The MVP has no stated scale that justifies a GIS service.
2. Centralized projection prevents a client from bypassing privacy or moderation rules.
3. Deterministic cells make cluster counts stable across clients and testable without a map vendor SDK.
4. Reusing current market tables avoids duplicate publication and disable state.
5. The detail page remains the single place for authorized contact access.

## Trade-offs Accepted

- Map positions are approximate and cannot support exact navigation.
- Grid boundaries can make neighboring records appear in separate clusters; cell-size tuning is a later UX improvement.
- SQLite scans may become insufficient at high volume; the endpoint has bounded viewport/limit rules and indexed filters.
- A real map provider still needs valid Mini Program configuration for production rendering.

## API Contract

- `GET /market/recruitment-posts/map` for approved applicants.
- `GET /market/job-seeking-information/map` for approved recruiters.
- Required query: `south`, `west`, `north`, `east`, `zoom`.
- Optional query: existing direction-specific filters and `limit`.
- Response: `{ data: { items: MarketMapItem[], zoom, nextCursor } }`.
- `MarketMapItem` includes `id` for a single record, `cluster`, `count` for clusters, privacy `latitude`/`longitude`, `publishedAt`, and safe display summary fields.

## Security And Privacy

- Bounds must be finite, ordered, and limited to a supported viewport span.
- Zoom and result limits are bounded server-side.
- The response never contains raw stored coordinates, contacts, or detailed addresses.
- Blocked, disabled, reported-for-removal, and returned records are filtered before aggregation.
- Details remain protected by the existing approved-counterpart identity and contact-view logging rules.

## Rollback And Migration

- No new source-of-truth table is required. Existing latitude/longitude columns remain owner-protected.
- The map entry can be disabled by feature configuration while card browsing continues.
- If scale requires a GIS/search service later, the map projection DTO remains the compatibility boundary and the query implementation can be replaced behind it.

## Revisit Triggers

- More than the current MVP scale or unacceptable map query latency.
- A requirement for exact navigation, radius search, heatmaps, or provider-native clustering.
- A second public client needing a shared map SDK or map provider integration.
