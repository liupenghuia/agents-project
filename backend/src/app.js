import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bootstrapAdmin,
  countActiveOwners,
  completeMediaUpload,
  createMediaUpload,
  createRecruitmentPost,
  createAdminAccount,
  createAdminSession,
  createDatabase,
  createSession,
  createUserForProvider,
  findAdminByLogin,
  findAdminById,
  findAdminSession,
  findRoleProfileForUser,
  findSessionUser,
  getApplicantJobSeekingInformation,
  getRecruiterInformation,
  getRecruitmentPost,
  grantReviewer,
  listRecruitmentPosts,
  listAdminAccounts,
  listUsers,
  getUser,
  createManagedUser,
  updateManagedUser,
  disableUser,
  listMarketRecruitmentPosts,
  mapMarketRecruitmentPosts,
  getMarketRecruitmentPost,
  listMarketJobSeekingInformation,
  mapMarketJobSeekingInformation,
  getMarketJobSeekingInformation,
  getPublicRecruitmentImage,
  setMarketVisibility,
  setFavorite,
  listFavorites,
  createMarketReport,
  listMarketReports,
  listAdminMarketContent,
  listAdminAuditLogs,
  decideMarketContent,
  resolveMarketReport,
  recordContactView,
  recordAdminAudit,
  revokeAdminSession,
  touchAdminLogin,
  updateRecruitmentPost,
  updateAdminLogin,
  upsertApplicantJobSeekingInformation,
  upsertRecruiterInformation,
  verifyPassword,
} from './db.js';
import { createWeChatExchange, createWeChatPhoneExchange } from './wechat.js';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const MAX_BODY_BYTES = 1024 * 1024;
const roles = new Set(['recruiter', 'applicant']);
const statusValues = new Set(['pending_review', 'approved', 'changes_requested']);
const adminRoles = new Set(['owner', 'admin', 'reviewer', 'operator']);
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImageBytes = 10 * 1024 * 1024;

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const isoAfter = (milliseconds) => new Date(Date.now() + milliseconds).toISOString();
const text = (value) => String(value ?? '').trim();

function createRateLimiter() {
  const buckets = new Map();
  return (key, maximum, windowMs) => {
    const timestamp = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.expiresAt <= timestamp) bucket = { count: 0, expiresAt: timestamp + windowMs };
    if (bucket.count >= maximum) return false;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 10000) {
      for (const [bucketKey, value] of buckets) {
        if (value.expiresAt <= timestamp) buckets.delete(bucketKey);
      }
    }
    return true;
  };
}

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

function sendBinary(response, status, contentType, body) {
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
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

function assertMaxLengths(body, limits) {
  for (const [field, maximum] of Object.entries(limits)) {
    if (body[field] !== undefined && text(body[field]).length > maximum) {
      throw httpError(422, 'VALIDATION_ERROR', `${field} 长度不能超过 ${maximum}`);
    }
  }
}

function assertPhone(phone) {
  if (!/^\+?[0-9 -]{5,32}$/.test(text(phone))) throw httpError(422, 'VALIDATION_ERROR', '手机号格式无效');
}

function assertCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw httpError(422, 'VALIDATION_ERROR', '位置坐标无效');
  }
}

function assertJobSeekingInformation(body) {
  assertRequired(body, ['jobTypeName', 'expectedSalary', 'workMethod', 'locationText']);
  assertMaxLengths(body, { jobTypeName: 120, expectedSalary: 100, locationText: 200, preferredWorkScope: 200 });
  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 1 || age > 120) throw httpError(422, 'VALIDATION_ERROR', '年龄必须是 1 到 120 的整数');
  if (!['monthly_settlement', 'indefinite_duration'].includes(text(body.workMethod))) {
    throw httpError(422, 'VALIDATION_ERROR', '工作方式无效');
  }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  assertCoordinates(latitude, longitude);
  return {
    jobTypeName: text(body.jobTypeName), age, expectedSalary: text(body.expectedSalary),
    workMethod: text(body.workMethod), locationText: text(body.locationText), latitude, longitude,
    preferredWorkScope: text(body.preferredWorkScope),
  };
}

function assertRecruiterInformation(body) {
  assertRequired(body, ['detailedAddress']);
  assertMaxLengths(body, { detailedAddress: 300 });
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  assertCoordinates(latitude, longitude);
  return { latitude, longitude, detailedAddress: text(body.detailedAddress) };
}

function assertImageKeys(imageKeys) {
  if (!Array.isArray(imageKeys) || imageKeys.length > 6 || imageKeys.some((key) => !text(key))) {
    throw httpError(422, 'VALIDATION_ERROR', '图片最多上传 6 张');
  }
  return imageKeys.map(text);
}

function assertRecruitmentPost(body) {
  assertRequired(body, ['jobType', 'salaryRange', 'settlementMethod', 'locationText']);
  assertMaxLengths(body, { jobType: 120, salaryRange: 100, settlementMethod: 100, locationText: 200 });
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  assertCoordinates(latitude, longitude);
  return {
    jobType: text(body.jobType), salaryRange: text(body.salaryRange), settlementMethod: text(body.settlementMethod),
    locationText: text(body.locationText), latitude, longitude, imageKeys: assertImageKeys(body.imageKeys || []),
  };
}

function assertManagedUser(body, partial = false) {
  if (!partial) assertRequired(body, ['email', 'name']);
  assertMaxLengths(body, { email: 160, name: 120 });
  if (body.email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text(body.email))) throw httpError(422, 'VALIDATION_ERROR', '邮箱格式无效');
  if (body.name !== undefined && !text(body.name)) throw httpError(422, 'VALIDATION_ERROR', '姓名不能为空');
  if (body.status !== undefined && !['active', 'disabled'].includes(text(body.status))) throw httpError(422, 'VALIDATION_ERROR', '用户状态无效');
  return { ...(body.email !== undefined ? { email: text(body.email) } : {}), ...(body.name !== undefined ? { name: text(body.name) } : {}), ...(body.status !== undefined ? { status: text(body.status) } : {}) };
}

function assertMarketTarget(body) {
  if (!['recruitment_post', 'applicant_information'].includes(text(body.targetType))) throw httpError(422, 'VALIDATION_ERROR', '举报对象类型无效');
  assertRequired(body, ['targetId', 'reason']);
  assertMaxLengths(body, { targetId: 200, reason: 1000 });
  return { targetType: text(body.targetType), targetId: text(body.targetId), reason: text(body.reason) };
}

function adminMarketContentQuery(url) {
  const targetType = text(url.searchParams.get('targetType'));
  const status = text(url.searchParams.get('status'));
  const publishedFrom = text(url.searchParams.get('publishedFrom')) || null;
  const publishedTo = text(url.searchParams.get('publishedTo')) || null;
  const limit = Number(url.searchParams.get('limit') || 100);
  if (targetType && !['recruitment_post', 'applicant_information'].includes(targetType)) {
    throw httpError(422, 'VALIDATION_ERROR', '市场内容类型无效');
  }
  if (status && !['published', 'pending_review', 'changes_requested', 'disabled'].includes(status)) {
    throw httpError(422, 'VALIDATION_ERROR', '市场内容状态无效');
  }
  if ((publishedFrom && Number.isNaN(Date.parse(publishedFrom)))
    || (publishedTo && Number.isNaN(Date.parse(publishedTo)))
    || (publishedFrom && publishedTo && publishedFrom > publishedTo)
    || !Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw httpError(422, 'VALIDATION_ERROR', '发布时间范围或数量限制无效');
  }
  return { targetType, status, publishedFrom, publishedTo, limit };
}

function assertMarketModerationDecision(body) {
  const decision = text(body.decision);
  const reason = text(body.reason);
  if (!['approve', 'request_changes', 'disable', 'restore'].includes(decision)) {
    throw httpError(422, 'VALIDATION_ERROR', '内容审核决定无效');
  }
  if (reason.length > 1000) throw httpError(422, 'VALIDATION_ERROR', '审核原因不能超过 1000 个字符');
  if (decision === 'request_changes' && !reason) throw httpError(422, 'VALIDATION_ERROR', '打回时必须填写原因');
  return { decision, reason };
}

function marketMapQuery(url) {
  const bounds = {
    south: Number(url.searchParams.get('south')),
    west: Number(url.searchParams.get('west')),
    north: Number(url.searchParams.get('north')),
    east: Number(url.searchParams.get('east')),
  };
  const zoom = Number(url.searchParams.get('zoom'));
  const limit = Number(url.searchParams.get('limit') || 50);
  const validBounds = Object.values(bounds).every(Number.isFinite)
    && bounds.south >= -90 && bounds.north <= 90 && bounds.west >= -180 && bounds.east <= 180
    && bounds.south < bounds.north && bounds.west < bounds.east
    && bounds.north - bounds.south <= 60 && bounds.east - bounds.west <= 120;
  if (!validBounds || !Number.isInteger(zoom) || zoom < 3 || zoom > 20
    || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw httpError(422, 'INVALID_MAP_VIEWPORT', '地图范围、缩放级别或数量限制无效');
  }
  return { bounds, zoom, limit };
}

function marketListQuery(url) {
  const limit = Number(url.searchParams.get('limit') || 20);
  const sort = text(url.searchParams.get('sort')) || 'newest';
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || sort !== 'newest') {
    throw httpError(422, 'VALIDATION_ERROR', '列表数量或排序方式无效');
  }
  return {
    cursor: url.searchParams.get('cursor'),
    limit,
    keyword: text(url.searchParams.get('keyword')),
  };
}

async function readBuffer(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxImageBytes + 1024 * 1024) throw httpError(413, 'PAYLOAD_TOO_LARGE', '图片内容过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function multipartFile(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) throw httpError(400, 'INVALID_MULTIPART', '图片上传格式无效');
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'));
  const closing = buffer.lastIndexOf(boundary);
  if (headerEnd < 0 || closing <= headerEnd) throw httpError(400, 'INVALID_MULTIPART', '图片内容无效');
  const dataEnd = buffer.lastIndexOf(Buffer.from('\r\n'), closing);
  return buffer.subarray(headerEnd + 4, dataEnd >= headerEnd + 4 ? dataEnd : closing);
}

function detectImageContentType(file) {
  if (file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return 'image/jpeg';
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (file.length >= 12 && file.subarray(0, 4).toString('ascii') === 'RIFF'
    && file.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function validateProfile(role, body) {
  if (role === 'recruiter') {
    assertRequired(body, ['organizationName', 'organizationType', 'contactName', 'contactPhone', 'region', 'industryOrJobDirection']);
    assertMaxLengths(body, { organizationName: 120, contactName: 80, contactPhone: 32, region: 120, industryOrJobDirection: 120 });
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
  assertMaxLengths(body, { displayName: 80, contactPhone: 32, region: 120, desiredJob: 120, experienceSummary: 2000, preferredRegionOrTime: 200 });
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

function mapApplicantJobSeekingInformation(row) {
  return {
    roleProfileId: row.role_profile_id,
    jobTypeName: row.job_type_name,
    age: row.age,
    expectedSalary: row.expected_salary,
    workMethod: row.work_method,
    locationText: row.location_text,
    latitude: row.latitude,
    longitude: row.longitude,
    ...(row.preferred_work_scope ? { preferredWorkScope: row.preferred_work_scope } : {}),
    status: row.visibility_status || 'published',
    publishedAt: row.published_at || row.created_at,
    ...(row.disabled_at ? { disabledAt: row.disabled_at } : {}),
    ...(row.moderation_reason ? { moderationReason: row.moderation_reason } : {}),
    ...(row.moderated_at ? { moderatedAt: row.moderated_at } : {}),
    updatedAt: row.updated_at,
  };
}

function mapRecruiterInformation(row) {
  return {
    roleProfileId: row.role_profile_id,
    latitude: row.latitude,
    longitude: row.longitude,
    detailedAddress: row.detailed_address,
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

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertAdminAccountMutation(db, actor, target, changes) {
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
    recordAdminAudit(db, reviewerId, 'identity.review.decided', 'role_profile', identityId, {
      decision,
      ...(text(reason) ? { reason: text(reason) } : {}),
    });
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
  const mediaRoot = options.mediaRoot || process.env.MEDIA_ROOT || join(process.cwd(), 'media');
  const consumeRateLimit = createRateLimiter();

  const handler = async (request, response) => {
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

      if (request.method === 'GET' && path === '/health') {
        return send(response, 200, { data: { status: 'ok', service: 'recruitment-backend' } });
      }

      if (request.method === 'GET' && publicMediaPath) {
        const image = getPublicRecruitmentImage(db, publicMediaPath[1]);
        if (!image) throw httpError(404, 'MEDIA_NOT_FOUND', '图片不存在');
        try {
          return sendBinary(response, 200, image.content_type, await readFile(join(mediaRoot, image.object_key)));
        } catch (error) {
          if (error.code === 'ENOENT') throw httpError(404, 'MEDIA_NOT_FOUND', '图片不存在');
          throw error;
        }
      }

      if (request.method === 'POST' && path === '/auth/wechat/session') {
        if (!consumeRateLimit(`wechat-session:${request.socket.remoteAddress}`, 60, 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '登录请求过于频繁，请稍后再试');
        assertRequired(body, ['code']);
        assertMaxLengths(body, { code: 512 });
        const provider = await exchange(text(body.code));
        const user = createUserForProvider(db, provider.providerSubject, provider.unionId);
        const sessionToken = randomBytes(32).toString('base64url');
        createSession(db, user.id, tokenHash(sessionToken), isoAfter(sessionTtlMs));
        return send(response, 200, { data: { userId: user.id, sessionToken, expiresAt: isoAfter(sessionTtlMs) } });
      }

      if (request.method === 'POST' && path === '/auth/wechat/phone') {
        authenticate(request, db);
        assertRequired(body, ['code']);
        assertMaxLengths(body, { code: 512 });
        return send(response, 200, { data: await exchangePhone(text(body.code)) });
      }

      if (request.method === 'POST' && path === '/me/recruitment-posts/image-upload-url') {
        const user = authenticate(request, db);
        if (!findRoleProfileForUser(db, user.id, 'recruiter')) throw httpError(403, 'IDENTITY_REQUIRED', '需要先创建招人身份');
        assertRequired(body, ['fileName', 'contentType', 'byteSize']);
        assertMaxLengths(body, { fileName: 255, contentType: 64 });
        const contentType = text(body.contentType);
        const byteSize = Number(body.byteSize);
        if (!imageTypes.has(contentType) || !Number.isInteger(byteSize) || byteSize < 1 || byteSize > maxImageBytes) {
          throw httpError(422, 'VALIDATION_ERROR', '图片类型或大小无效');
        }
        const objectKey = `${user.id}-${randomBytes(16).toString('hex')}`;
        const expiresAt = isoAfter(15 * 60 * 1000);
        createMediaUpload(db, user.id, { objectKey, contentType, byteSize, expiresAt });
        return send(response, 200, { data: { objectKey, uploadUrl: `/me/recruitment-posts/image-upload/${objectKey}`, expiresAt } });
      }

      if (request.method === 'POST' && uploadPath) {
        const user = authenticate(request, db);
        const contentType = text(request.headers['content-type']);
        const file = multipartFile(await readBuffer(request), contentType);
        const detectedContentType = detectImageContentType(file);
        if (!detectedContentType) throw httpError(422, 'INVALID_IMAGE_CONTENT', '图片内容格式无效');
        const upload = completeMediaUpload(db, user.id, uploadPath[1], file.length, detectedContentType);
        if (!upload) throw httpError(422, 'INVALID_UPLOAD', '上传引用无效、已过期、类型不符或图片过大');
        await mkdir(mediaRoot, { recursive: true });
        await writeFile(join(mediaRoot, upload.object_key), file);
        return send(response, 200, { data: { objectKey: upload.object_key, contentType: upload.content_type, byteSize: file.length } });
      }

      if (request.method === 'POST' && path === '/admin/auth/login') {
        if (!consumeRateLimit(`admin-login:${request.socket.remoteAddress}`, 10, 15 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '登录尝试过于频繁，请稍后再试');
        assertRequired(body, ['loginName', 'password']);
        assertMaxLengths(body, { loginName: 120, password: 256 });
        const admin = findAdminByLogin(db, text(body.loginName));
        if (!admin || admin.status !== 'active' || !verifyPassword(text(body.password), admin.password_hash)) {
          throw httpError(401, 'UNAUTHORIZED', '管理员账号或密码错误');
        }
        touchAdminLogin(db, admin.user_id);
        recordAdminAudit(db, admin.user_id, 'admin.login.succeeded', 'admin_account', admin.user_id);
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
        if (admin.role !== 'owner' && text(body.role) === 'owner') throw httpError(403, 'OWNER_PROTECTED', '非所有者不能创建所有者账号');
        if (text(body.loginName).length > 120) throw httpError(422, 'VALIDATION_ERROR', '管理员账号长度无效');
        if (text(body.password).length < 12 || text(body.password).length > 256) throw httpError(422, 'VALIDATION_ERROR', '管理员密码长度必须为 12 到 256 位');
        try {
          return send(response, 201, { data: createAdminAccount(db, { loginName: text(body.loginName), password: text(body.password), role: text(body.role), createdBy: admin.user_id }) });
        } catch (error) {
          if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'ADMIN_EXISTS', '管理员账号已存在');
          throw error;
        }
      }

      const adminAccountPath = /^\/admin\/accounts\/([^/]+)$/u.exec(path);
      if (request.method === 'PATCH' && adminAccountPath) {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        if (!['password', 'status', 'role'].some((field) => hasOwn(body, field))) throw httpError(422, 'VALIDATION_ERROR', '至少需要修改一个管理员字段');
        if (hasOwn(body, 'status') && !['active', 'disabled'].includes(text(body.status))) throw httpError(422, 'VALIDATION_ERROR', '管理员状态无效');
        if (hasOwn(body, 'role') && !adminRoles.has(text(body.role))) throw httpError(422, 'VALIDATION_ERROR', '管理员角色无效');
        if (hasOwn(body, 'password') && (text(body.password).length < 12 || text(body.password).length > 256)) throw httpError(422, 'VALIDATION_ERROR', '管理员密码长度必须为 12 到 256 位');
        const target = findAdminById(db, adminAccountPath[1]);
        if (!target) throw httpError(404, 'ADMIN_NOT_FOUND', '管理员不存在');
        const changes = {
          ...(hasOwn(body, 'password') ? { password: text(body.password) } : {}),
          ...(hasOwn(body, 'status') ? { status: text(body.status) } : {}),
          ...(hasOwn(body, 'role') ? { role: text(body.role) } : {}),
        };
        assertAdminAccountMutation(db, admin, target, changes);
        const updated = updateAdminLogin(db, adminAccountPath[1], changes, admin.user_id);
        return send(response, 200, { data: updated });
      }

      if (request.method === 'GET' && path === '/admin/audit-logs') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner']);
        const limit = Number(url.searchParams.get('limit') || 100);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw httpError(422, 'VALIDATION_ERROR', '审计日志数量限制无效');
        return send(response, 200, { data: listAdminAuditLogs(db, limit) });
      }

      const userPath = /^\/users\/([^/]+)$/u.exec(path);
      if (request.method === 'GET' && path === '/users') {
        requireAdminRole(authenticateAdmin(request, db), ['owner', 'admin']);
        return send(response, 200, { data: listUsers(db) });
      }
      if (request.method === 'POST' && path === '/users') {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        try {
          const user = createManagedUser(db, assertManagedUser(body));
          recordAdminAudit(db, admin.user_id, 'user.created', 'user', user.id, { email: user.email, name: user.name });
          return send(response, 201, { data: user });
        }
        catch (error) { if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'EMAIL_EXISTS', '邮箱已存在'); throw error; }
      }
      if (request.method === 'GET' && userPath) {
        requireAdminRole(authenticateAdmin(request, db), ['owner', 'admin']);
        const user = getUser(db, userPath[1]); if (!user) throw httpError(404, 'USER_NOT_FOUND', '用户不存在');
        return send(response, 200, { data: user });
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
          return send(response, 200, { data: user });
        }
        catch (error) { if (String(error.message).includes('UNIQUE constraint failed')) throw httpError(409, 'EMAIL_EXISTS', '邮箱已存在'); throw error; }
      }
      if (request.method === 'DELETE' && userPath) {
        const admin = authenticateAdmin(request, db);
        requireAdminRole(admin, ['owner', 'admin']);
        const user = disableUser(db, userPath[1]); if (!user) throw httpError(404, 'USER_NOT_FOUND', '用户不存在');
        recordAdminAudit(db, admin.user_id, 'user.disabled', 'user', user.id);
        return send(response, 204, null);
      }

      const identityPath = /^\/me\/identities\/([^/]+)$/u.exec(path);
      const resubmitPath = /^\/me\/identities\/([^/]+)\/resubmit$/u.exec(path);
      const reviewDecisionPath = /^\/admin\/identity-reviews\/([^/]+)\/decision$/u.exec(path);
      const recruitmentPostPath = /^\/me\/recruitment-posts\/([^/]+)$/u.exec(path);
      const marketRecruitmentPath = /^\/market\/recruitment-posts\/([^/]+)$/u.exec(path);
      const marketApplicantPath = /^\/market\/job-seeking-information\/([^/]+)$/u.exec(path);
      const favoriteRecruitmentPath = /^\/me\/favorites\/recruitment-posts\/([^/]+)$/u.exec(path);
      const favoriteApplicantPath = /^\/me\/favorites\/job-seeking-information\/([^/]+)$/u.exec(path);
      const disablePostPath = /^\/me\/recruitment-posts\/([^/]+)\/disable$/u.exec(path);
      const adminMarketContentDecisionPath = /^\/admin\/market-content\/(recruitment_post|applicant_information)\/([^/]+)\/decision$/u.exec(path);

      if (request.method === 'GET' && path === '/me/applicant/job-seeking-information') {
        const user = authenticate(request, db);
        const information = getApplicantJobSeekingInformation(db, user.id);
        return send(response, 200, { data: information && mapApplicantJobSeekingInformation(information) });
      }
      if (request.method === 'PUT' && path === '/me/applicant/job-seeking-information') {
        const user = authenticate(request, db);
        return send(response, 200, { data: mapApplicantJobSeekingInformation(upsertApplicantJobSeekingInformation(db, user.id, assertJobSeekingInformation(body))) });
      }
      if (request.method === 'GET' && path === '/me/recruiter/information') {
        const user = authenticate(request, db);
        const information = getRecruiterInformation(db, user.id);
        return send(response, 200, { data: information && mapRecruiterInformation(information) });
      }
      if (request.method === 'PUT' && path === '/me/recruiter/information') {
        const user = authenticate(request, db);
        return send(response, 200, { data: mapRecruiterInformation(upsertRecruiterInformation(db, user.id, assertRecruiterInformation(body))) });
      }
      if (request.method === 'GET' && path === '/me/recruitment-posts') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listRecruitmentPosts(db, user.id) });
      }
      if (request.method === 'POST' && path === '/me/recruitment-posts') {
        const user = authenticate(request, db);
        return send(response, 201, { data: createRecruitmentPost(db, user.id, assertRecruitmentPost(body)) });
      }
      if (request.method === 'GET' && recruitmentPostPath) {
        const user = authenticate(request, db);
        const post = getRecruitmentPost(db, user.id, recruitmentPostPath[1]);
        if (!post) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在');
        return send(response, 200, { data: post });
      }
      if (request.method === 'PATCH' && recruitmentPostPath) {
        const user = authenticate(request, db);
        const current = getRecruitmentPost(db, user.id, recruitmentPostPath[1]);
        if (!current) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在');
        const next = assertRecruitmentPost({
          ...current,
          ...body,
          imageKeys: body.imageKeys || current.images.map((image) => image.objectKey),
        });
        return send(response, 200, { data: updateRecruitmentPost(db, user.id, recruitmentPostPath[1], next) });
      }

      if (request.method === 'POST' && disablePostPath) {
        const user = authenticate(request, db); if (!setMarketVisibility(db, user.id, 'recruitment_post', disablePostPath[1], false)) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在'); return send(response, 204, null);
      }
      if (request.method === 'POST' && path === '/me/applicant/job-seeking-information/disable') {
        const user = authenticate(request, db); if (!setMarketVisibility(db, user.id, 'applicant_information', '', false)) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在'); return send(response, 204, null);
      }
      if (request.method === 'GET' && path === '/market/recruitment-posts') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listMarketRecruitmentPosts(db, user.id, {
          ...marketListQuery(url),
          jobType: text(url.searchParams.get('jobType')),
          salaryRange: text(url.searchParams.get('salaryRange')),
          settlementMethod: text(url.searchParams.get('settlementMethod')),
          location: text(url.searchParams.get('location')),
        }) });
      }
      if (request.method === 'GET' && path === '/market/recruitment-posts/map') {
        const user = authenticate(request, db);
        const mapQuery = marketMapQuery(url);
        return send(response, 200, { data: mapMarketRecruitmentPosts(db, user.id, mapQuery.bounds, {
          zoom: mapQuery.zoom, limit: mapQuery.limit, jobType: text(url.searchParams.get('jobType')),
          salaryRange: text(url.searchParams.get('salaryRange')), location: text(url.searchParams.get('location')),
        }) });
      }
      if (request.method === 'GET' && marketRecruitmentPath) {
        const user = authenticate(request, db); const item = getMarketRecruitmentPost(db, user.id, marketRecruitmentPath[1]); if (!item) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在'); if (!recordContactView(db, user.id, 'recruitment_post', marketRecruitmentPath[1])) throw httpError(429, 'CONTACT_RATE_LIMITED', '联系方式查看次数过多，请稍后再试'); return send(response, 200, { data: item });
      }
      if (request.method === 'GET' && path === '/market/job-seeking-information') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listMarketJobSeekingInformation(db, user.id, {
          ...marketListQuery(url),
          jobTypeName: text(url.searchParams.get('jobTypeName')),
          expectedSalary: text(url.searchParams.get('expectedSalary')),
          workMethod: text(url.searchParams.get('workMethod')),
          location: text(url.searchParams.get('location')),
        }) });
      }
      if (request.method === 'GET' && path === '/market/job-seeking-information/map') {
        const user = authenticate(request, db);
        const mapQuery = marketMapQuery(url);
        return send(response, 200, { data: mapMarketJobSeekingInformation(db, user.id, mapQuery.bounds, {
          zoom: mapQuery.zoom, limit: mapQuery.limit, jobTypeName: text(url.searchParams.get('jobTypeName')),
          expectedSalary: text(url.searchParams.get('expectedSalary')), workMethod: text(url.searchParams.get('workMethod')),
          location: text(url.searchParams.get('location')),
        }) });
      }
      if (request.method === 'GET' && marketApplicantPath) {
        const user = authenticate(request, db); const item = getMarketJobSeekingInformation(db, user.id, marketApplicantPath[1]); if (!item) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在'); if (!recordContactView(db, user.id, 'applicant_information', marketApplicantPath[1])) throw httpError(429, 'CONTACT_RATE_LIMITED', '联系方式查看次数过多，请稍后再试'); return send(response, 200, { data: item });
      }
      if (request.method === 'GET' && path === '/me/favorites/recruitment-posts') { const user = authenticate(request, db); return send(response, 200, { data: listFavorites(db, user.id, 'recruitment') }); }
      if (request.method === 'PUT' && favoriteRecruitmentPath) { const user = authenticate(request, db); if (!setFavorite(db, user.id, 'recruitment', favoriteRecruitmentPath[1], true)) throw httpError(404, 'POST_NOT_FOUND', '招聘信息不存在'); return send(response, 204, null); }
      if (request.method === 'DELETE' && favoriteRecruitmentPath) { const user = authenticate(request, db); setFavorite(db, user.id, 'recruitment', favoriteRecruitmentPath[1], false); return send(response, 204, null); }
      if (request.method === 'GET' && path === '/me/favorites/job-seeking-information') { const user = authenticate(request, db); return send(response, 200, { data: listFavorites(db, user.id, 'applicant') }); }
      if (request.method === 'PUT' && favoriteApplicantPath) { const user = authenticate(request, db); if (!setFavorite(db, user.id, 'applicant', favoriteApplicantPath[1], true)) throw httpError(404, 'INFORMATION_NOT_FOUND', '求职信息不存在'); return send(response, 204, null); }
      if (request.method === 'DELETE' && favoriteApplicantPath) { const user = authenticate(request, db); setFavorite(db, user.id, 'applicant', favoriteApplicantPath[1], false); return send(response, 204, null); }
      if (request.method === 'POST' && path === '/me/market-reports') { const user = authenticate(request, db); const report = createMarketReport(db, user.id, assertMarketTarget(body)); if (!report) throw httpError(404, 'MARKET_NOT_FOUND', '举报对象不存在'); return send(response, 201, { data: report }); }
      if (request.method === 'GET' && path === '/admin/market-content') { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); return send(response, 200, { data: listAdminMarketContent(db, adminMarketContentQuery(url)) }); }
      if (request.method === 'POST' && adminMarketContentDecisionPath) { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); const input = assertMarketModerationDecision(body); const item = decideMarketContent(db, admin.user_id, adminMarketContentDecisionPath[1], adminMarketContentDecisionPath[2], input.decision, input.reason); if (!item) throw httpError(404, 'MARKET_NOT_FOUND', '市场内容不存在'); return send(response, 200, { data: item }); }
      if (request.method === 'GET' && path === '/admin/market-reports') { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); const status = url.searchParams.get('status'); if (status && !['open', 'resolved', 'rejected'].includes(status)) throw httpError(422, 'VALIDATION_ERROR', '举报状态无效'); return send(response, 200, { data: listMarketReports(db, status) }); }
      const marketReportDecisionPath = /^\/admin\/market-reports\/([^/]+)\/decision$/u.exec(path);
      if (request.method === 'POST' && marketReportDecisionPath) { const admin = authenticateAdmin(request, db); requireAdminRole(admin, ['owner', 'operator']); if (!['resolved', 'rejected'].includes(text(body.decision))) throw httpError(422, 'VALIDATION_ERROR', '处理决定无效'); const report = resolveMarketReport(db, admin.user_id, marketReportDecisionPath[1], text(body.decision)); if (!report) throw httpError(404, 'REPORT_NOT_FOUND', '举报不存在'); return send(response, 200, { data: report }); }

      if (request.method === 'GET' && path === '/me/identities') {
        const user = authenticate(request, db);
        return send(response, 200, { data: listIdentityRows(db, user.id).map(summaryFromRow) });
      }
      if (request.method === 'POST' && (path === '/me/identities/recruiter' || path === '/me/identities/applicant')) {
        const user = authenticate(request, db);
        if (!consumeRateLimit(`identity-create:${user.id}`, 10, 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '身份提交过于频繁，请稍后再试');
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
        if (!consumeRateLimit(`identity-resubmit:${user.id}`, 10, 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '重新提交过于频繁，请稍后再试');
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
        if (!consumeRateLimit(`identity-review:${admin.user_id}`, 120, 60 * 60 * 1000)) throw httpError(429, 'RATE_LIMITED', '审核操作过于频繁，请稍后再试');
        assertMaxLengths(body, { reason: 1000 });
        return send(response, 200, { data: decideReview(db, admin.user_id, reviewDecisionPath[1], body.decision, body.reason) });
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
  };

  handler.db = db;
  handler.grantReviewer = (userId) => grantReviewer(db, userId);
  handler.close = () => db.close();
  return handler;
}
