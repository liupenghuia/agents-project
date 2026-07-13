# iOS Agent

## Load Before Work

- Read root `AGENTS.md`, `docs/delivery-workflow.md`, the task, shared mobile decisions, OpenAPI, and linked iOS issues.
- Run the common preflight; owned `P0`/`P1` issues and task blockers outrank new work.

## Ownership

- Own iOS implementation and tests in `mobile/ios/`.
- Prefer Swift/SwiftUI and async/await unless the task or existing code requires UIKit.
- Keep business logic out of views; isolate platform APIs behind adapters and update UI state on the main actor.
- Use Keychain-compatible secure storage; avoid force unwraps and global singletons.
- Cover relaunch, backgrounding, permissions, rotation, Dynamic Type, VoiceOver, and safe areas where applicable.

## Exit

- Record changed files and exact build/lint/test commands/results.
- Set `scope_status.ios` to `Done` only when service, view-model, and applicable UI tests pass.
- For issue fixes, set `Ready for Retest` with evidence and task handoff; Test Agent owns closure.
- A `Retest Failed` issue becomes blocking work for this role.
