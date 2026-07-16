import {
  createIdentity, updateIdentityForResubmit, identityFromRow, identityRow, normalizeRow,
  listIdentityRows, summaryFromRow, updateRoleProfile, decideReview, reviewRows,
} from '../db.js';
import { statusValues, validateProfile } from '../domain/validators.js';

/** @param {any} ctx */
export async function tryHandleIdentity(ctx) {
  const {
    request, response, path, url, body,
    db, consumeRateLimit,
    send, httpError, assertMaxLengths, text, normalizedPhone,
    authenticate, authenticateAdmin, requireAdminRole,
  } = ctx;

  const identityPath = /^\/me\/identities\/([^/]+)$/u.exec(path);
  const profilePath = /^\/me\/identities\/([^/]+)\/profile$/u.exec(path);
  const resubmitPath = /^\/me\/identities\/([^/]+)\/resubmit$/u.exec(path);
  const reviewDecisionPath = /^\/admin\/identity-reviews\/([^/]+)\/decision$/u.exec(path);

  if (request.method === 'GET' && path === '/me/identities') {
    const user = authenticate(request, db);
    send(response, 200, { data: listIdentityRows(db, user.id).map(summaryFromRow) });
    return true;
  }

  if (request.method === 'POST' && (path === '/me/identities/recruiter' || path === '/me/identities/applicant')) {
    const user = authenticate(request, db);
    if (!consumeRateLimit(`identity-create:${user.id}`, 10, 60 * 60 * 1000)) {
      throw httpError(429, 'RATE_LIMITED', '身份提交过于频繁，请稍后再试');
    }
    const role = path.endsWith('/recruiter') ? 'recruiter' : 'applicant';
    send(response, 201, { data: createIdentity(db, user.id, role, validateProfile(role, body)) });
    return true;
  }

  if (request.method === 'GET' && identityPath) {
    const user = authenticate(request, db);
    const row = normalizeRow(identityRow(db, identityPath[1]));
    if (!row || row.user_id !== user.id) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
    send(response, 200, { data: identityFromRow(row) });
    return true;
  }

  if (request.method === 'PATCH' && profilePath) {
    const user = authenticate(request, db);
    const row = normalizeRow(identityRow(db, profilePath[1]));
    if (!row || row.user_id !== user.id) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
    const profile = validateProfile(row.role, body);
    if (normalizedPhone(profile.contactPhone) !== normalizedPhone(row.contact_phone)) {
      throw httpError(409, 'PHONE_IMMUTABLE', '手机号已绑定角色，不能修改');
    }
    if (!updateRoleProfile(db, user.id, profilePath[1], row.role, profile)) {
      throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
    }
    send(response, 200, { data: identityFromRow(normalizeRow(identityRow(db, profilePath[1]))) });
    return true;
  }

  if (request.method === 'POST' && resubmitPath) {
    const user = authenticate(request, db);
    if (!consumeRateLimit(`identity-resubmit:${user.id}`, 10, 60 * 60 * 1000)) {
      throw httpError(429, 'RATE_LIMITED', '重新提交过于频繁，请稍后再试');
    }
    const row = normalizeRow(identityRow(db, resubmitPath[1]));
    if (!row || row.user_id !== user.id) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
    if (!body.profile || typeof body.profile !== 'object') throw httpError(422, 'VALIDATION_ERROR', '缺少 profile');
    send(response, 200, {
      data: updateIdentityForResubmit(db, user.id, resubmitPath[1], validateProfile(row.role, body.profile)),
    });
    return true;
  }

  if (request.method === 'GET' && path === '/admin/identity-reviews') {
    const admin = authenticateAdmin(request, db);
    requireAdminRole(admin, ['owner', 'reviewer']);
    const status = url.searchParams.get('status') || null;
    if (status && !statusValues.has(status)) throw httpError(422, 'VALIDATION_ERROR', '审核状态无效');
    send(response, 200, { data: reviewRows(db, status).map(identityFromRow) });
    return true;
  }

  if (request.method === 'POST' && reviewDecisionPath) {
    const admin = authenticateAdmin(request, db);
    requireAdminRole(admin, ['owner', 'reviewer']);
    if (!consumeRateLimit(`identity-review:${admin.user_id}`, 120, 60 * 60 * 1000)) {
      throw httpError(429, 'RATE_LIMITED', '审核操作过于频繁，请稍后再试');
    }
    assertMaxLengths(body, { reason: 1000 });
    send(response, 200, {
      data: decideReview(db, admin.user_id, reviewDecisionPath[1], body.decision, body.reason),
    });
    return true;
  }

  return false;
}
