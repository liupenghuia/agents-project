import { join } from 'node:path';
import { bootstrapAdmin, createDatabase, grantReviewer } from './db.js';
import { createWeChatExchange, createWeChatPhoneExchange } from './wechat.js';
import { createDeps } from './create-deps.js';
import { handleRequest } from './routes/index.js';

export function createApp(options = {}) {
  const db = options.db || createDatabase(options.dbPath);
  const bootstrap = options.bootstrapAdmin || {
    loginName: process.env.ADMIN_BOOTSTRAP_LOGIN_NAME,
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  };
  if (process.env.NODE_ENV === 'production' && bootstrap.password) {
    throw new Error('管理员 bootstrap 在 production 环境被禁止');
  }
  bootstrapAdmin(db, bootstrap);
  const exchange = options.wechatExchange || createWeChatExchange(options.wechat || {});
  const exchangePhone = options.wechatPhoneExchange || createWeChatPhoneExchange(options.wechat || {});
  const sessionTtlMs = options.sessionTtlMs || 7 * 24 * 60 * 60 * 1000;
  const adminSessionTtlMs = options.adminSessionTtlMs || 8 * 60 * 60 * 1000;
  const mediaRoot = options.mediaRoot || process.env.MEDIA_ROOT || join(process.cwd(), 'media');

  const deps = createDeps({
    db,
    exchange,
    exchangePhone,
    sessionTtlMs,
    adminSessionTtlMs,
    mediaRoot,
  });

  const handler = async (request, response) => handleRequest(request, response, deps);
  handler.db = db;
  handler.grantReviewer = (userId) => grantReviewer(db, userId);
  handler.close = () => db.close();
  return handler;
}
