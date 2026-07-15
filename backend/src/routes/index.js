import { tryHandleAuth } from './auth.js';
import { tryHandleAdmin } from './admin.js';
import { tryHandleUsers } from './users.js';
import { tryHandleInformation } from './information.js';
import { tryHandleMarket } from './market.js';
import { tryHandleIdentity } from './identity.js';
import { tryHandleCollaboration } from './collaboration.js';

const domainHandlers = [
  tryHandleAuth,
  tryHandleAdmin,
  tryHandleUsers,
  tryHandleInformation,
  tryHandleMarket,
  tryHandleIdentity,
  tryHandleCollaboration,
];

export async function handleRequest(request, response, deps) {
  const {
    send, sendError, readJson, httpError,
  } = deps;

  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', 'content-type, authorization');
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (request.method === 'OPTIONS') return send(response, 204, {});

  try {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname;
    const uploadPath = /^\/me\/recruitment-posts\/image-upload\/([^/]+)$/u.exec(path);
    const publicMediaPath = /^\/market\/media\/([^/]+)$/u.exec(path);
    const body = ['POST', 'PUT', 'PATCH'].includes(request.method) && !uploadPath ? await readJson(request) : {};

    const ctx = {
      ...deps,
      request,
      response,
      url,
      path,
      body,
      uploadPath,
      publicMediaPath,
    };

    for (const handler of domainHandlers) {
      // eslint-disable-next-line no-await-in-loop
      if (await handler(ctx)) return;
    }

    throw httpError(404, 'NOT_FOUND', '请求地址不存在');
  } catch (error) {
    if (error.message === 'COUNTERPART_IDENTITY_REQUIRED') {
      error.status = 403;
      error.code = 'APPROVED_IDENTITY_REQUIRED';
      error.message = '需要对应已审核通过的身份';
    }
    if (error.message === 'INVALID_IMAGE_REFERENCES') {
      error.status = 422;
      error.code = 'INVALID_IMAGE_REFERENCES';
      error.message = '图片上传引用无效或已过期，请重新上传';
    }
    if (error.message === 'INVALID_MARKET_TRANSITION') {
      error.status = 409;
      error.code = 'INVALID_MARKET_TRANSITION';
      error.message = `当前内容状态 ${error.currentStatus} 不允许该操作`;
    }
    sendError(response, error);
  }
}
