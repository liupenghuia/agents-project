import { findSessionUser } from './auth.js';
import { countActiveOwners, findAdminSession } from './admin.js';
import { httpError, tokenHash } from '../http.js';

export function authenticate(request, db) {
  const header = request.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw httpError(401, 'UNAUTHORIZED', '需要登录');
  const user = findSessionUser(db, tokenHash(match[1]));
  if (!user || user.status !== 'active') throw httpError(401, 'UNAUTHORIZED', '登录已失效');
  return user;
}

export function adminAccount(admin) {
  return {
    id: admin.user_id,
    loginName: admin.login_name,
    status: admin.status,
    role: admin.role,
    ...(admin.last_login_at ? { lastLoginAt: admin.last_login_at } : {}),
  };
}

export function adminBearer(request) {
  const header = request.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw httpError(401, 'UNAUTHORIZED', '需要管理员登录');
  return match[1];
}

export function authenticateAdmin(request, db) {
  const admin = findAdminSession(db, tokenHash(adminBearer(request)));
  if (!admin || admin.status !== 'active') throw httpError(401, 'UNAUTHORIZED', '管理员登录已失效');
  return admin;
}

export function requireAdminRole(admin, allowedRoles) {
  if (!allowedRoles.includes(admin.role)) throw httpError(403, 'FORBIDDEN', '没有管理员权限');
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function assertAdminAccountMutation(db, actor, target, changes) {
  if (actor.role !== 'owner') {
    if (target.role === 'owner') throw httpError(403, 'OWNER_PROTECTED', '非所有者不能操作所有者账号');
    if (hasOwn(changes, 'role')) throw httpError(403, 'FORBIDDEN', '只有所有者可以修改管理员角色');
  }
  const disablesOwner = target.role === 'owner' && target.status === 'active'
    && ((hasOwn(changes, 'status') && changes.status === 'disabled')
      || (hasOwn(changes, 'role') && changes.role !== 'owner'));
  if (disablesOwner && countActiveOwners(db) <= 1) {
    throw httpError(409, 'LAST_OWNER_PROTECTED', '必须保留至少一个启用的所有者账号');
  }
}
