import { normalizeDomainError } from '../domain/errors.js';
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
    sendError(response, normalizeDomainError(error));
  }
}
