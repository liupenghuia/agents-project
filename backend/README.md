# Recruitment Backend

Node.js backend for the recruitment phase-one contract.

## Runtime

- Node.js `>=22.9` for the built-in `node:sqlite` module and native `.env` loading.
- No third-party dependency installation is required for the current test harness.

## Commands

```bash
npm test
npm start
```

本地开发时将配置写入 `backend/.env`，`npm start` 会自动加载，服务重启无需重新输入。该文件已被 Git 忽略；请以 `.env.example` 为模板创建。生产环境应使用部署平台的 Secret/Environment 配置，不要把真实密钥提交到仓库。

Environment variables for a real WeChat integration:

- `PORT`: HTTP port, default `3000`.
- `DATABASE_PATH`: SQLite file path, default `:memory:`.
- `WECHAT_APP_ID`: Mini Program app ID.
- `WECHAT_APP_SECRET`: Mini Program app secret.
- `WECHAT_SESSION_URL`: optional override for the WeChat session endpoint.
- `WECHAT_TOKEN_URL`: optional override for the WeChat access-token endpoint.
- `WECHAT_PHONE_URL`: optional override for the WeChat phone-number endpoint.
- `WECHAT_MOCK=1`: development-only mock exchange; ignored when `NODE_ENV=production`.
- `ADMIN_BOOTSTRAP_LOGIN_NAME`: local-only initial owner login name.
- `ADMIN_BOOTSTRAP_PASSWORD`: local-only initial owner password, minimum 12 characters; ignored/forbidden in production.

Without WeChat credentials, the session and phone endpoints return `WECHAT_NOT_CONFIGURED` unless development mock mode is enabled. Tests inject provider adapters and never call WeChat.

The phone endpoint is `POST /auth/wechat/phone` with a platform session bearer token and the one-time `code` returned by `wx.getPhoneNumber`. The backend exchanges the code with WeChat; the AppSecret is never sent to the Mini Program.

The implementation follows `docs/openapi.yaml` and `docs/database.md`. Reviewer accounts are provisioned through the application/admin layer via the `identity_review` permission; this phase does not expose a public reviewer self-registration endpoint.

For local development, copy `.env.example` to `.env`, replace the bootstrap password with a local secret, and run `npm start`. The first start creates the owner account from the two bootstrap variables. Bootstrap is one-time for a database: changing the variables does not overwrite an existing account. No administrator password is committed to the repository.
