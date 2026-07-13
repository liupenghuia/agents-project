# Architecture

## Architecture Style

Use a simple modular full-stack architecture:

- `frontend/` owns UI, client-side state, routing, and API integration.
- `backend/` owns API endpoints, business rules, validation, persistence, and external service integration.
- `mobile/` owns shared mobile behavior; `mobile/ios/` and `mobile/android/` own platform integration.
- `ideas/` owns Product Briefs, evidence labels, MVP decisions, and promotion references.
- `docs/openapi.yaml` is the contract between frontend and backend.
- `docs/database.md` is the contract for data model decisions.
- YAML front matter in `tasks/` and `issues/` is the machine-readable delivery state.
- `docs/delivery-workflow.md` defines transitions, quality gates, blockers, and recovery.

## Decision Principles

- Start with a modular monolith unless scaling pressure proves otherwise.
- Keep frontend and backend independently testable.
- Treat OpenAPI as the source of truth for HTTP behavior.
- Treat task acceptance criteria as the source of truth for testing.
- Avoid adding infrastructure before a feature requires it.

## Agent Handoff Model

```text
raw idea
  -> product discovery and approval
  -> requirements and task
  -> architecture and contracts
  -> required implementation scopes
       -> backend
       -> frontend
       -> shared mobile / iOS / Android
  -> test verification
       -> pass -> release gate -> done
       -> fail -> issue -> owner fix -> independent retest
```

Implementation scopes may run concurrently after contracts are stable. Each owner updates only its `scope_status`; the overall task advances after every required scope passes its exit gate.

## Boundaries

### Frontend Boundary

Frontend may:

- Render screens and components.
- Validate user input for user experience.
- Call backend APIs.
- Handle loading, empty, error, and success states.

Frontend must not:

- Invent API fields not present in `docs/openapi.yaml`.
- Rely on undocumented backend behavior.
- Store sensitive secrets.

### Backend Boundary

Backend may:

- Validate and authorize requests.
- Execute business rules.
- Read and write database records.
- Return documented API responses.

Backend must not:

- Return undocumented response shapes.
- Move product decisions into implementation without updating requirements.
- Change database assumptions without updating `docs/database.md`.

### Mobile Boundary

Shared Mobile may own cross-platform state, navigation, API mapping, caching, and domain rules. iOS and Android own platform UI, lifecycle, permissions, secure storage, and packaging. Platform agents must not fork shared product behavior without updating requirements or architecture.

## Defect Routing

- Product ambiguity goes to Product Agent.
- Contract ambiguity goes to Architect Agent.
- UI defects go to Frontend Agent.
- API or persistence defects go to Backend Agent.
- Shared mobile defects go to Mobile Agent; platform-only defects go to iOS Agent or Android Agent.
- Cross-boundary defects go to Architect Agent first.

## Revisit Triggers

Revisit this architecture when:

- Frontend and backend need independent deployment.
- Multiple backend services become necessary.
- The API contract becomes too large to manage manually.
- Performance or security requirements require specialized infrastructure.
