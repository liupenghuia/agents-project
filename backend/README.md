# Recruitment Backend

Node.js backend for the recruitment phase-one contract.

## Runtime

- Node.js `>=22.5` for the built-in `node:sqlite` module.
- No third-party dependency installation is required for the current test harness.

## Commands

```bash
npm test
npm start
```

Environment variables for a real WeChat integration:

- `PORT`: HTTP port, default `3000`.
- `DATABASE_PATH`: SQLite file path, default `:memory:`.
- `WECHAT_APP_ID`: Mini Program app ID.
- `WECHAT_APP_SECRET`: Mini Program app secret.
- `WECHAT_SESSION_URL`: optional override for the WeChat session endpoint.
- `WECHAT_MOCK=1`: development-only mock exchange; ignored when `NODE_ENV=production`.

Without WeChat credentials, the session endpoint returns `WECHAT_NOT_CONFIGURED` unless development mock mode is enabled. Tests inject a provider adapter and never call WeChat.

The implementation follows `docs/openapi.yaml` and `docs/database.md`. Reviewer accounts are provisioned through the application/admin layer via the `identity_review` permission; this phase does not expose a public reviewer self-registration endpoint.
