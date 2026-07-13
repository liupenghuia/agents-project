# Requirements

## Product Goal

Build a maintainable full-stack application using a multi-agent development process.

## Users

- End user: uses the product features through the frontend.
- Mobile user: uses the product features through iOS or Android apps when mobile is in scope.
- Admin user: manages users and operational data when required.
- Development team: uses this repository structure to coordinate product, architecture, frontend, backend, and testing work.
- Recruiter: creates a hiring identity and submits recruitment information for manual review.
- Applicant: creates a job-seeking identity and submits basic job-seeking information for manual review.
- Reviewer: manually reviews registration profiles and approves or requests changes.

## Current Feature Scope

### User Management

The first feature module is user management.

Minimum scope:

- Create user.
- View user profile.
- Update user profile.
- Disable or delete user.

### Login Authentication

The next feature module is login authentication.

Minimum scope:

- Register a user account.
- Log in with email and password.
- Log out from the current session.
- View the current authenticated user.
- Protect authenticated-only pages and APIs.
- Show clear errors for invalid credentials and expired sessions.

### Recruitment Platform Phase 1: Role Selection And Registration

The first recruitment phase is limited to a WeChat Mini Program. It establishes the identity boundary before job posting or job seeking features are built.

Minimum scope:

- Show new users two entry choices: `招人` and `应聘`.
- Provide separate minimum registration flows for each identity.
- Follow WeChat Mini Program authorization, privacy, and user agreement requirements.
- Allow one WeChat user to own both a recruiter identity and an applicant identity.
- Keep each created identity type immutable; creating the other identity uses a separate registration flow.
- Submit registration profiles for manual review.
- Show `待审核`, `通过`, and `拒绝/需修改` states with actionable feedback.
- Do not perform real-name verification, identity document collection, or enterprise certification in phase one.

Out of scope:

- Job posting, resumes, search, matching, applications, chat, interviews, hiring, payments, and recommendations.
- iOS App and Android App delivery in phase one.

## Non-Functional Requirements

### Security

- Validate all backend inputs.
- Avoid exposing sensitive user data in frontend responses.
- Document authentication and authorization decisions before implementation.
- Passwords must never be stored or returned in plain text.
- Authentication state must be represented by a server-verifiable session or token.
- Protected APIs must reject unauthenticated requests.

### Reliability

- API errors must return predictable error responses.
- Frontend must show useful failure states.
- Expired or invalid sessions must fail safely and redirect users to login where appropriate.

### Maintainability

- API behavior must match `docs/openapi.yaml`.
- Database changes must be reflected in `docs/database.md`.
- Every feature must have a task file in `tasks/`.
- Every new feature task must reference its approved source Idea, or document why product discovery is not required.
- Mobile features must also define iOS and Android task coverage when mobile delivery is in scope.

### Testability

- Every task must include acceptance criteria.
- Test Agent must be able to verify the task without reading private implementation notes.

## Acceptance Criteria

- A feature is not complete until it passes the quality gates in `docs/delivery-workflow.md`.
- Any failed verification must create an issue under `issues/`.
- Issues must be fixed by the owning agent and retested by the Test Agent.
- Login authentication is not complete until registration, login, logout, current-user lookup, protected route behavior, and invalid-session behavior are all testable.
- Mobile-authored flows are not complete until iOS and Android behavior is testable where mobile delivery is in scope.
