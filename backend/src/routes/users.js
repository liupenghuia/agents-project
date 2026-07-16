import {
  listUsers, getUser, createManagedUser, updateManagedUser, disableUser, recordAdminAudit,
} from '../db.js';
import { assertManagedUser } from '../domain/validators.js';

/** @param {any} ctx */
export async function tryHandleUsers(ctx) {
  const {
    request, response, path, body,
    db, send, httpError,
    authenticateAdmin, requireAdminRole,
  } = ctx;

  const userPath = /^\/users\/([^/]+)$/u.exec(path);

  if (request.method === 'GET' && path === '/users') {
    requireAdminRole(authenticateAdmin(request, db), ['owner', 'admin']);
    send(response, 200, { data: listUsers(db) });
    return true;
  }

  if (request.method === 'POST' && path === '/users') {
    const admin = authenticateAdmin(request, db);
    requireAdminRole(admin, ['owner', 'admin']);
    try {
      const user = createManagedUser(db, assertManagedUser(body));
      recordAdminAudit(db, admin.user_id, 'user.created', 'user', user.id, { email: user.email, name: user.name });
      send(response, 201, { data: user });
      return true;
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) {
        throw httpError(409, 'EMAIL_EXISTS', '邮箱已存在');
      }
      throw error;
    }
  }

  if (request.method === 'GET' && userPath) {
    requireAdminRole(authenticateAdmin(request, db), ['owner', 'admin']);
    const user = getUser(db, userPath[1]);
    if (!user) throw httpError(404, 'USER_NOT_FOUND', '用户不存在');
    send(response, 200, { data: user });
    return true;
  }

  if (request.method === 'PATCH' && userPath) {
    const admin = authenticateAdmin(request, db);
    requireAdminRole(admin, ['owner', 'admin']);
    try {
      const changes = assertManagedUser(body, true);
      if (!Object.keys(changes).length) throw httpError(422, 'VALIDATION_ERROR', '至少需要修改一个用户字段');
      const user = updateManagedUser(db, userPath[1], changes);
      if (!user) throw httpError(404, 'USER_NOT_FOUND', '用户不存在');
      recordAdminAudit(db, admin.user_id, 'user.updated', 'user', user.id, { changedFields: Object.keys(changes) });
      send(response, 200, { data: user });
      return true;
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) {
        throw httpError(409, 'EMAIL_EXISTS', '邮箱已存在');
      }
      throw error;
    }
  }

  if (request.method === 'DELETE' && userPath) {
    const admin = authenticateAdmin(request, db);
    requireAdminRole(admin, ['owner', 'admin']);
    const user = disableUser(db, userPath[1]);
    if (!user) throw httpError(404, 'USER_NOT_FOUND', '用户不存在');
    recordAdminAudit(db, admin.user_id, 'user.disabled', 'user', user.id);
    send(response, 204, null);
    return true;
  }

  return false;
}
