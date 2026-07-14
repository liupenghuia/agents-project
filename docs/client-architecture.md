# Client Architecture Standard

## Scope

This standard applies before implementation changes in Frontend coordination, WeChat Mini Program, Web, shared Mobile, iOS, and Android scopes.

## Dependency Model

- Presentation owns rendering and user input; it does not own transport mapping, persistence, or reusable business rules.
- Application/state code owns use-case orchestration and explicit UI state transitions.
- Domain code owns reusable business rules when the product behavior warrants a separate boundary.
- Data code owns API DTO mapping, repositories, cache, and persistence; transport objects do not become UI models by default.
- Platform adapters isolate WeChat, browser, iOS, and Android APIs from application and domain code.
- Presentation depends on application/state interfaces; data and platform adapters implement inward-facing interfaces. Application/domain code does not import presentation, transport, or platform APIs. Avoid cycles and hidden global state.
- Scale physical layers to the change. A small change may stay in one module when responsibilities remain clear; do not add abstractions without a concrete boundary or testability benefit.

## Pre-Coding Check

Complete and record this check before editing client implementation code:

- **Context:** Read the task, requirements, architecture, OpenAPI, linked issues, and the target's existing implementation pattern.
- **Ownership:** Name the affected user flow and the module responsible for UI, state/orchestration, business rules, data mapping, persistence, and platform APIs.
- **Placement:** Reuse or extend the existing owner. Do not create a second source of truth, duplicate business rules across screens, or let presentation code bypass approved API clients and platform adapters to call raw transport/platform primitives.
- **Dependencies:** Confirm the dependency direction, public interfaces, and lifecycle ownership. Resolve circular dependencies or unclear ownership before coding.
- **Sharing:** Decide which behavior is cross-target and which is platform-specific. Share contracts and business semantics; keep platform UI and APIs behind target adapters. Do not extract shared code without a real second consumer.
- **Evolution:** Account for loading, empty, success, validation, permission, offline, timeout, retry, cancellation, and stale-result states as applicable. Identify compatibility, migration, rollback, security, privacy, and observability impacts.
- **Verification:** Choose tests at the changed boundaries, including state transitions, mapping, navigation, lifecycle, and error paths as applicable.
- **Decision:** Record the result in the task's `Client Architecture Pre-Coding Check` section. For older tasks without that section, record it in the next handoff before listing implementation evidence.

Use this compact record per target:

```text
Target/module:
Existing pattern and owner:
Responsibility and dependency decision:
Shared vs target-specific decision:
State/contract/security impact:
Verification plan:
Architecture review: Not required (reason) | Required (link/decision)
```

## Architect Review Triggers

Return to Architect review before coding when a change introduces or alters:

- a client framework, foundational dependency, architectural pattern, layer, or cross-target shared module;
- ownership of business rules, global state, navigation, caching, persistence, authentication, or platform services;
- API/database contracts, security/privacy boundaries, compatibility, migration, or rollback behavior;
- dependency direction that cannot follow this standard without a documented exception.

Significant decisions update `docs/architecture.md` or an ADR. A local change that preserves existing boundaries records `Architecture review: Not required` with the reused pattern and reason.
