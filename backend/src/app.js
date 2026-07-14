import { createHash, randomBytes } from 'node:crypto';
import {
  bootstrapAdmin,
  createAdminAccount,
  createAdminSession,
  createDatabase,
  createSession,
  createUserForProvider,
  findAdminByLogin,
  findAdminSession,
  findSessionUser,
  grantReviewer,
  listAdminAccounts,
  revokeAdminSession,
  touchAdminLogin,
  verifyPassword,
} from './db.js';
import { createWeChatExchange, createWeChatPhoneExchange } from './wechat.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const MAX_BODY_BYTES = 1024 * 1024;
const roles = new Set(['recruiter', 'applicant']);
const statusValues = new Set(['pending_review', 'approved', 'changes_requested']);
const adminRoles = new Set(['owner', 'admin', 'reviewer', 'operator']);

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const isoAfter = (milliseconds) => new Date(Date.now() + milliseconds).toISOString();
const text = (value) => String(value ?? '').trim();

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function send(response, status, payload) {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  send(response, status, {
    error: { code: error.code || 'INTERNAL_ERROR', message: status === 500 ? '服务暂时不可用' : error.message },
  });
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'INVALID_JSON', '请求 JSON 格式无效');
  }
}

function assertRequired(body, fields) {
  const missing = fields.find((field) => !text(body[field]));
  if (missing) throw httpError(422, 'VALIDATION_ERROR', `缺少必填字段：${missing}`);
}

function assertPhone(phone) {
  if (!/^\+?[0-9 -]{5,32}$/.test(text(phone))) throw httpError(422, 'VALIDATION_ERROR', '手机号格式无效');
}

function validateProfile(role, body) {
  if (role === 'recruiter') {
    assertRequired(body, ['organizationName', 'organizationType', 'contactName', 'contactPhone', 'region', 'industryOrJobDirection']);
    if (!['company', 'individual', 'other'].includes(text(body.organizationType))) {
      throw httpError(422, 'VALIDATION_ERROR', '招聘主体类型无效');
    }
    assertPhone(body.contactPhone);
    return {
      organizationName: text(body.organizationName),
      organizationType: text(body.organizationType),
      contactName: text(body.contactName),
      contactPhone: text(body.contactPhone),
      region: text(body.region),
      industryOrJobDirection: text(body.industryOrJobDirection),
    };
  }
  assertRequired(body, ['displayName', 'contactPhone', 'region', 'desiredJob', 'experienceSummary', 'preferredRegionOrTime']);
  assertPhone(body.contactPhone);
  return {
    displayName: text(body.displayName),
    contactPhone: text(body.contactPhone),
    region: text(body.region),
    desiredJob: text(body.desiredJob),
    experienceSummary: text(body.experienceSummary),
    preferredRegionOrTime: text(body.preferredRegionOrTime),
  };
}

function profileFromRow(row) {
  if (row.role === 'recruiter') {
    return {
      roleProfileId: row.id,
      organizationName: row.organization_name,
      organizationType: row.organization_type,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      region: row.region,
      industryOrJobDirection: row.industry_or_job_direction,
    };
  }
  return {
    roleProfileId: row.id,
    displayName: row.display_name,
    contactPhone: row.contact_phone,
    region: row.region,
    desiredJob: row.desired_job,
    experienceSummary: row.experience_summary,
    preferredRegionOrTime: row.preferred_region_or_time,
  };
}

function identityFromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    reviewStatus: row.review_status,
    ...(row.review_reason ? { reviewReason: row.review_reason } : {}),
    profile: profileFromRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function identityRow(db, identityId) {
  return db.prepare(`
    SELECT rp.*, r.organization_name, r.organization_type, r.contact_name, r.contact_phone,
      r.region AS recruiter_region, r.industry_or_job_direction,
      a.display_name, a.contact_phone AS applicant_phone, a.region AS applicant_region,
      a.desired_job, a.experience_summary, a.preferred_region_or_time
    FROM role_profiles rp
    LEFT JOIN recruiter_profiles r ON r.role_profile_id = rp.id
    LEFT JOIN applicant_profiles a ON a.role_profile_id = rp.id
    WHERE rp.id = ?
  `).get(identityId) || null;
}

function normalizeRow(row) {
  if (!row) return row;
  if (row.role === 'recruiter') {
    row.region = row.recruiter_region;
  } else {
    row.region = row.applicant_region;
    row.contact_phone = row.applicant_phone;
  }
  return row;
}

function listIdentityRows(db, userId, status = null) {
  const filter = status ? ' AND rp.review_status = ?' : '';
  const params = status ? [userId, status] : [userId];
  return db.prepare(`
    SELECT rp.*, r.organization_name, r.organization_type, r.contact_name, r.contact_phone,
      r.region AS recruiter_region, r.industry_or_job_direction,
      a.display_name, a.contact_phone AS applicant_phone, a.region AS applicant_region,
      a.desired_job, a.experience_summary, a.preferred_region_or_time
    FROM role_profiles rp
    LEFT JOIN recruiter_profiles r ON r.role_profile_id = rp.id
    LEFT JOIN applicant_profiles a ON a.role_profile_id = rp.id
    WHERE rp.user_id = ?${filter}
    ORDER BY rp.created_at ASC
  `).all(...params).map(normalizeRow);
}

function summaryFromRow(row) {
  return {
    id: row.id,
    role: row.role,
    reviewStatus: row.review_status,
    ...(row.review_reason ? { reviewReason: row.review_reason } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createIdentity(db, userId, role, profile) {
  const existing = db.prepare('SELECT id FROM role_profiles WHERE user_id = ? AND role = ?').get(userId, role);
  if (existing) throw httpError(409, 'IDENTITY_EXISTS', '该身份已经创建');
  const timestamp = new Date().toISOString();
  const identityId = randomBytes(16).toString('hex');
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO role_profiles(id, user_id, role, review_status, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, 'pending_review', ?, ?, ?)
    `).run(identityId, userId, role, timestamp, timestamp, timestamp);
    if (role === 'recruiter') {
      db.prepare(`
        INSERT INTO recruiter_profiles(role_profile_id, organization_name, organization_type, contact_name,
          contact_phone, region, industry_or_job_direction, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(identityId, profile.organizationName, profile.organizationType, profile.contactName,
        profile.contactPhone, profile.region, profile.industryOrJobDirection, timestamp, timestamp);
    } else {
      db.prepare(`
        INSERT INTO applicant_profiles(role_profile_id, display_name, contact_phone, region, desired_job,
          experience_summary, preferred_region_or_time, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(identityId, profile.displayName, profile.contactPhone, profile.region, profile.desiredJob,
        profile.experienceSummary, profile.preferredRegionOrTime, timestamp, timestamp);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return identityFromRow(normalizeRow(identityRow(db, identityId)));
}

function updateIdentityForResubmit(db, userId, identityId, profile) {
  const row = normalizeRow(identityRow(db, identityId));
  if (!row || row.user_id !== userId) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
  if (row.review_status !== 'changes_requested') throw httpError(409, 'INVALID_IDENTITY_STATE', '当前身份不允许重新提交');
  const timestamp = new Date().toISOString();
  db.exec('BEGIN');
  try {
    if (row.role === 'recruiter') {
      db.prepare(`UPDATE recruiter_profiles SET organization_name = ?, organization_type = ?, contact_name = ?,
        contact_phone = ?, region = ?, industry_or_job_direction = ?, updated_at = ? WHERE role_profile_id = ?`)
        .run(profile.organizationName, profile.organizationType, profile.contactName, profile.contactPhone,
          profile.region, profile.industryOrJobDirection, timestamp, identityId);
    } else {
      db.prepare(`UPDATE applicant_profiles SET display_name = ?, contact_phone = ?, region = ?, desired_job = ?,
        experience_summary = ?, preferred_region_or_time = ?, updated_at = ? WHERE role_profile_id = ?`)
        .run(profile.displayName, profile.contactPhone, profile.region, profile.desiredJob,
          profile.experienceSummary, profile.preferredRegionOrTime, timestamp, identityId);
    }
    db.prepare(`UPDATE role_profiles SET review_status = 'pending_review', review_reason = NULL,
      submitted_at = ?, reviewed_at = NULL, updated_at = ? WHERE id = ?`)
      .run(timestamp, timestamp, identityId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return identityFromRow(normalizeRow(identityRow(db, identityId)));
}

function authenticate(request, db) {
  const header = request.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw httpError(401, 'UNAUTHORIZED', '需要登录');
  const user = findSessionUser(db, tokenHash(match[1]));
  if (!user || user.status !== 'active') throw httpError(401, 'UNAUTHORIZED', '登录已失效');
  return user;
}

function adminAccount(admin) {
  return {
    id: admin.user_id,
    loginName: admin.login_name,
    status: admin.status,
    role: admin.role,
    ...(admin.last_login_at ? { lastLoginAt: admin.last_login_at } : {}),
  };
}

function adminBearer(request) {
  const header = request.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw httpError(401, 'UNAUTHORIZED', '需要管理员登录');
  return match[1];
}

function authenticateAdmin(request, db) {
  const admin = findAdminSession(db, tokenHash(adminBearer(request)));
  if (!admin || admin.status !== 'active') throw httpError(401, 'UNAUTHORIZED', '管理员登录已失效');
  return admin;
}

function requireAdminRole(admin, allowedRoles) {
  if (!allowedRoles.includes(admin.role)) throw httpError(403, 'FORBIDDEN', '没有管理员权限');
}

function reviewRows(db, status) {
  const condition = status ? 'WHERE rp.review_status = ?' : "WHERE rp.review_status IN ('pending_review', 'changes_requested')";
  return db.prepare(`
    SELECT rp.*, r.organization_name, r.organization_type, r.contact_name, r.contact_phone,
      r.region AS recruiter_region, r.industry_or_job_direction,
      a.display_name, a.contact_phone AS applicant_phone, a.region AS applicant_region,
      a.desired_job, a.experience_summary, a.preferred_region_or_time
    FROM role_profiles rp
    LEFT JOIN recruiter_profiles r ON r.role_profile_id = rp.id
    LEFT JOIN applicant_profiles a ON a.role_profile_id = rp.id
    ${condition}
    ORDER BY rp.submitted_at ASC
  `).all(...(status ? [status] : [])).map(normalizeRow);
}

function decideReview(db, reviewerId, identityId, decision, reason) {
  if (!['approved', 'changes_requested'].includes(decision)) throw httpError(422, 'VALIDATION_ERROR', '审核决定无效');
  if (decision === 'changes_requested' && !text(reason)) throw httpError(422, 'VALIDATION_ERROR', '要求修改时必须填写原因');
  const row = identityRow(db, identityId);
  if (!row) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
  if (!['pending_review', 'changes_requested'].includes(row.review_status)) throw httpError(409, 'INVALID_IDENTITY_STATE', '当前身份不在待审核状态');
  const timestamp = new Date().toISOString();
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE role_profiles SET review_status = ?, review_reason = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
      .run(decision, decision === 'changes_requested' ? text(reason) : null, timestamp, timestamp, identityId);
    const reviewColumns = db.prepare('PRAGMA table_info(review_actions)').all().map((column) => column.name);
    if (reviewColumns.includes('reviewer_user_id')) {
      db.prepare(`INSERT INTO review_actions(id, role_profile_id, admin_user_id, reviewer_user_id, decision, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(randomBytes(16).toString('hex'), identityId, reviewerId, reviewerId, decision, text(reason) || null, timestamp);
    } else {
      db.prepare(`INSERT INTO review_actions(id, role_profile_id, admin_user_id, decision, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(randomBytes(16).toString('hex'), identityId, reviewerId, decision, text(reason) || null, timestamp);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return identityFromRow(normalizeRow(identityRow(db, identityId)));
}

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

  const handler = async (request, response) => {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'content-type, authorization');
    response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    if (request.method === 'OPTIONS') return send(response, 204, {});
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = url.pathname;
      const body = request.method === 'POST' ? await readJson(request) : {};

      if (request.method === 'GET' && path === '/health') {
        return send(response, 200, { data: { status: 'ok', service: 'recruitment-backend' } });
      }

      if (request.method === 'POST' && path === '/auth/wechat/session') {
        assertRequired(body, ['code']);
        const provider = await exchange(text(body.code));
        const user = createUserForProvider(db, provider.providerSubject, provider.unionId);
        const sessionToken = randomBytes(32).toString('base64url');
        createSession(db, user.id, tokenHash(sessionToken), isoAfter(sessionTtlMs));
        return send(response, 200, { data: { userId: user.id, sessionToken, expiresAt: isoAfter(sessionTtlMs) } });
      }

      if (request.method === 'POST' && path === '/auth/wechat/phone') {
        authenticate(request, db);
        assertRequired(body, ['code']);
        return send(response, 200, { data: await exchangePhone(text(body.code)) });
      }

      if (request.method === 'POST' && path === '/admin/auth/login') {
        assertRequired(body, ['loginName', 'password']);
        const admin = findAdminByLogin(db, text(body.loginName));
        if (!admin || admin.status !== 'active' || !verifyPassword(text(body.password), admin.password_hash)) {
          throw httpError(401, 'UNAUTHORIZED', '管理员账号或密码错误');
        }
        touchAdminLogin(db, admin.user_id);
        const token = randomBytes(32).toString('base64url');
        createAdminSession(db, admin.user_id, tokenHash(token), isoAfter(adminSessionTtlMs));
        const current = findAdminSession(db, tokenHash(token));
        return send(response, 200, { data: { token, expiresAt: isoAfter(adminSessionTtlMs), admin: adminAccount(current) } });
      }

      if (request.method === 'POST' && path === '/admin/auth/logout') {
        const token = adminBearer(request);
        revokeAdminSession(db, tokenHash(token));
        return send(response, 204, null);
      }

      if (request.method === 'GET' && path === '/admin/auth/me') {
        return send(response, 200, { data: adminAccount(authenticateAdmin(request, db)) });
      }

      if (request.method === 'GET' && path === '/admin/accounts') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        return send(response, 200, { data: listAdminAccounts(db) });
      }

      if (request.method === 'POST' && path === '/admin/accounts') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        assertRequired(body, ['loginName', 'password', 'role']);
        if (!adminRoles.has(text(body.role))) throw httpError(422, 'VALIDATION_ERROR', '管理员角色无效');
        if (text(body.password).length < 12) throw httpError(422, 'VALIDATION_ERROR', '管理员密码至少需要 12 位');
        try {
          return send(response, 201, { data: createAdminAccount(db, { loginName: text(body.loginName), password: text(body.password), role: text(body.role), createdBy: admin.user_id }) });
        } catch (error) {
          if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'ADMIN_EXISTS', '管理员账号已存在');
          throw error;
        }
      }

      const identityPath = /^\/me\/identities\/([^/]+)$/u.exec(path);
      const resubmitPath = /^\/me\/identities\/([^/]+)\/resubmit$/u.exec(path);
      const reviewDecisionPath = /^\/admin\/identity-reviews\/([^/]+)\/decision$/u.exec(path);

      if (request.method === 'GET' && path === '/me/identities') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listIdentityRows(db, user.id).map(summaryFromRow) });
      }
      if (request.method === 'POST' && (path === '/me/identities/recruiter' || path === '/me/identities/applicant')) {
        const user = authenticate(request, db);
        const role = path.endsWith('/recruiter') ? 'recruiter' : 'applicant';
        return send(response, 201, { data: createIdentity(db, user.id, role, validateProfile(role, body)) });
      }
      if (request.method === 'GET' && identityPath) {
        const user = authenticate(request, db);
        const row = normalizeRow(identityRow(db, identityPath[1]));
        if (!row || row.user_id !== user.id) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
        return send(response, 200, { data: identityFromRow(row) });
      }
      if (request.method === 'POST' && resubmitPath) {
        const user = authenticate(request, db);
        const row = normalizeRow(identityRow(db, resubmitPath[1]));
        if (!row || row.user_id !== user.id) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
        if (!body.profile || typeof body.profile !== 'object') throw httpError(422, 'VALIDATION_ERROR', '缺少 profile');
        return send(response, 200, { data: updateIdentityForResubmit(db, user.id, resubmitPath[1], validateProfile(row.role, body.profile)) });
      }
      if (request.method === 'GET' && path === '/admin/identity-reviews') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'reviewer']);
        const status = url.searchParams.get('status') || null;
        if (status && !statusValues.has(status)) throw httpError(422, 'VALIDATION_ERROR', '审核状态无效');
        return send(response, 200, { data: reviewRows(db, status).map(identityFromRow) });
      }
      if (request.method === 'POST' && reviewDecisionPath) {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'reviewer']);
        return send(response, 200, { data: decideReview(db, admin.user_id, reviewDecisionPath[1], body.decision, body.reason) });
      }
      throw httpError(404, 'NOT_FOUND', '请求地址不存在');
    } catch (error) {
      sendError(response, error);
    }
  };

  handler.db = db;
  handler.grantReviewer = (userId) => grantReviewer(db, userId);
  handler.close = () => db.close();
  return handler;
}
