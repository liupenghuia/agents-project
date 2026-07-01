# Architecture

## Architecture Style

Use a simple modular full-stack architecture:

- `frontend/` owns UI, client-side state, routing, and API integration.
- `backend/` owns API endpoints, business rules, validation, persistence, and external service integration.
- `docs/openapi.yaml` is the contract between frontend and backend.
- `docs/database.md` is the contract for data model decisions.
- `tasks/` tracks feature delivery.
- `issues/` tracks verification failures and retest loops.

## Decision Principles

- Start with a modular monolith unless scaling pressure proves otherwise.
- Keep frontend and backend independently testable.
- Treat OpenAPI as the source of truth for HTTP behavior.
- Treat task acceptance criteria as the source of truth for testing.
- Avoid adding infrastructure before a feature requires it.

## Agent Handoff Model

```text
requirements
  -> architecture and contracts
  -> backend implementation
  -> frontend implementation
  -> test verification
  -> issue assignment
  -> owner fix
  -> retest
  -> done
```

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

## Defect Routing

- Product ambiguity goes to Product Agent.
- Contract ambiguity goes to Architect Agent.
- UI defects go to Frontend Agent.
- API or persistence defects go to Backend Agent.
- Cross-boundary defects go to Architect Agent first.

## Revisit Triggers

Revisit this architecture when:

- Frontend and backend need independent deployment.
- Multiple backend services become necessary.
- The API contract becomes too large to manage manually.
- Performance or security requirements require specialized infrastructure.

