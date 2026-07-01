# Testing Strategy

## Purpose

Testing verifies that product requirements, API contracts, frontend behavior, backend behavior, and database assumptions all match.

## Test Layers

### Backend Unit Tests

Validate:

- Request validation.
- Business rules.
- Error handling.
- Data mapping.

### Backend Integration Tests

Validate:

- API endpoints match `docs/openapi.yaml`.
- Database reads and writes work correctly.
- Error responses are stable.

### Frontend Unit and Component Tests

Validate:

- Components render expected states.
- User interactions trigger expected behavior.
- Form validation works before API submission.

### End-to-End Tests

Validate:

- User workflows across frontend and backend.
- Loading, success, empty, and error states.
- Regression scenarios from closed issues.

## Test Agent Rules

- Test Agent must not silently fix frontend or backend implementation.
- When a test fails, create an issue under `issues/`.
- Every issue must include reproduction steps, expected behavior, actual behavior, owner, and retest result.
- A task cannot move to `Done` while linked issues remain open.
- `Ready for Retest` issues must be tested before new feature test work.
- Only Test Agent can move an issue from `Ready for Retest` to `Closed`.
- If retest fails, Test Agent must set the issue to `Retest Failed` and return it to the same owner.

## Definition of Done

A task is done only when:

- Acceptance criteria pass.
- Required automated tests pass.
- Manual checks, if any, are recorded.
- Linked issues are closed.
