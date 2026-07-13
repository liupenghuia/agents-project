# Frontend MiniProgram Agent

## Load Before Work

- Read parent `frontend/AGENTS.md`, then root `AGENTS.md`.
- Read `docs/delivery-workflow.md`, the task, requirements, OpenAPI, and linked Mini Program issues.
- Run preflight and verify `frontend_targets.miniprogram: true` before starting feature work.

## Ownership

- Own `frontend/miniprogram/` and WeChat Mini Program UI, state, navigation, API integration, and tests.
- Use the repository's selected TypeScript/framework conventions; do not invent a second client stack.
- Route requests through a small API client and never expose `openid`, `session_key`, app secrets, or reviewer credentials.

## WeChat Standards

- Use WXML/WXSS/JavaScript or TypeScript patterns already present in the module; keep `setData`/render updates minimal.
- Handle `onLoad`, `onShow`, `onHide`, and `onUnload` deliberately; cancel stale requests and avoid duplicate submissions.
- Follow current WeChat authorization, privacy, user-agreement, phone-number, navigation, and platform review requirements.
- Model loading, empty, validation, success, pending-review, changes-requested, offline, timeout, and retry states explicitly.
- Keep role selection immutable per identity while supporting a second identity on the same account.
- Use accessible labels, readable error messages, sufficient hit targets, and small-screen-safe layouts.

## Exit And History

- Run the closest Mini Program build, lint, typecheck, and test commands; record exact commands and results.
- Set `scope_status.frontend_miniprogram` to `Done` only after the target checklist passes.
- Append target, changed files, commands/results, issues, and next action to the task handoff and `frontend/HISTORY.md`.
- For fixes, set the issue to `Ready for Retest`; Test Agent owns closure.
