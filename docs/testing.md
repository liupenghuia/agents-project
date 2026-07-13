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

### Mobile Unit, Component, and UI Tests

Validate:

- Shared mobile logic maps API data correctly.
- Screens render expected states.
- User interactions trigger expected behavior.
- Form and input validation work before API submission.
- Navigation, lifecycle, and error states behave correctly.

### Platform-Specific Mobile Tests

Validate:

- iOS-specific flows on iOS.
- Android-specific flows on Android.
- Secure storage and session handling work on each platform.

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
- Mobile, iOS, and Android test runs are required when a task includes mobile scope.
- Every test run must record date, environment/build, exact command or manual check, result, and evidence location.
- A missing tool, environment, fixture, or credential is a blocker, not a passing result.
- Run `ruby scripts/validate_workflow.rb` before the final task transition.

## Definition of Done

A task is done only when:

- Acceptance criteria pass.
- Required automated tests pass.
- Manual checks, if any, are recorded.
- Linked issues are closed.
- Every acceptance criterion has recorded evidence.
- All required task scopes are `Done`; excluded scopes are `N/A`.
- Release evidence is recorded when `release_required: true`.
- Workflow validation passes.
