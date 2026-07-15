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
  updateRoleProfile,
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
  createMarketUserBlock,
  listMarketUserBlocks,
  deleteMarketUserBlock,
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
  renewMarketPublication,
  verifyPassword,
} from './db.js';
import { createWeChatExchange, createWeChatPhoneExchange } from './wechat.js';
import {
  startConversation, listConversations, getConversation, listMessages, sendMessage,
  markConversationRead, endConversation, createApplication, listApplicationsForApplicant,
  listApplicationsForRecruiter, updateApplicationStatus, createInterview, listInterviews,
  respondInterview, cancelInterview,
} from './collaboration.js';
import {
  createRateLimiter, httpError, send, sendBinary, sendError, readJson,
  assertRequired, assertMaxLengths, assertPhone, normalizedPhone, assertCoordinates, text, tokenHash, isoAfter,
} from './http.js';
import { handleRequest } from './routes/index.js';

const roles = new Set(['recruiter', 'applicant']);
const statusValues = new Set(['pending_review', 'approved', 'changes_requested']);
const adminRoles = new Set(['owner', 'admin', 'reviewer', 'operator']);
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxImageBytes = 10 * 1024 * 1024;


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
  const publishedFromValue = text(url.searchParams.get('publishedFrom'));
  const publishedToValue = text(url.searchParams.get('publishedTo'));
  const limit = Number(url.searchParams.get('limit') || 100);
  if (targetType && !['recruitment_post', 'applicant_information'].includes(targetType)) {
    throw httpError(422, 'VALIDATION_ERROR', '市场内容类型无效');
  }
  if (status && !['published', 'pending_review', 'changes_requested', 'disabled'].includes(status)) {
    throw httpError(422, 'VALIDATION_ERROR', '市场内容状态无效');
  }
  if ((publishedFromValue && Number.isNaN(Date.parse(publishedFromValue)))
    || (publishedToValue && Number.isNaN(Date.parse(publishedToValue)))
    || !Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw httpError(422, 'VALIDATION_ERROR', '发布时间范围或数量限制无效');
  }
  const publishedFrom = publishedFromValue ? new Date(publishedFromValue).toISOString() : null;
  const publishedTo = publishedToValue ? new Date(publishedToValue).toISOString() : null;
  if (publishedFrom && publishedTo && publishedFrom > publishedTo) throw httpError(422, 'VALIDATION_ERROR', '发布时间范围无效');
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
  const publishedFrom = url.searchParams.get('publishedFrom');
  const publishedTo = url.searchParams.get('publishedTo');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || sort !== 'newest'
    || (publishedFrom && Number.isNaN(Date.parse(publishedFrom)))
    || (publishedTo && Number.isNaN(Date.parse(publishedTo)))) {
    throw httpError(422, 'VALIDATION_ERROR', '列表数量或排序方式无效');
  }
  return {
    cursor: url.searchParams.get('cursor'),
    limit,
    keyword: text(url.searchParams.get('keyword')),
    publishedFrom: publishedFrom ? new Date(publishedFrom).toISOString() : null,
    publishedTo: publishedTo ? new Date(publishedTo).toISOString() : null,
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
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
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
  const phone = normalizedPhone(profile.contactPhone);
  const phoneOwner = db.prepare(`
    SELECT rp.user_id, rp.role
    FROM role_profiles rp
    LEFT JOIN recruiter_profiles r ON r.role_profile_id = rp.id
    LEFT JOIN applicant_profiles a ON a.role_profile_id = rp.id
    WHERE REPLACE(REPLACE(COALESCE(r.contact_phone, a.contact_phone), ' ', ''), '-', '') = ?
    LIMIT 1
  `).get(phone);
  if (phoneOwner) {
    if (phoneOwner.user_id === userId && phoneOwner.role === role) throw httpError(409, 'IDENTITY_EXISTS', '该身份已经创建');
    throw httpError(409, 'PHONE_ROLE_BOUND', '该手机号已绑定其他角色，不能重复注册或切换角色');
  }
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
  const phone = normalizedPhone(profile.contactPhone);
  const phoneOwner = db.prepare(`
    SELECT rp.user_id, rp.id
    FROM role_profiles rp
    LEFT JOIN recruiter_profiles r ON r.role_profile_id = rp.id
    LEFT JOIN applicant_profiles a ON a.role_profile_id = rp.id
    WHERE REPLACE(REPLACE(COALESCE(r.contact_phone, a.contact_phone), ' ', ''), '-', '') = ?
      AND rp.id <> ?
    LIMIT 1
  `).get(phone, identityId);
  if (phoneOwner) throw httpError(409, 'PHONE_ROLE_BOUND', '该手机号已绑定其他角色，不能更换为该手机号');
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

  const deps = {
    db, exchange, exchangePhone, sessionTtlMs, adminSessionTtlMs, mediaRoot, consumeRateLimit,
    send, sendBinary, sendError, readJson, httpError, assertRequired, assertMaxLengths, assertPhone,
    normalizedPhone, assertCoordinates, text, tokenHash, isoAfter,
    authenticate, authenticateAdmin, requireAdminRole, adminBearer, adminAccount,
    validateProfile, createIdentity, updateIdentityForResubmit, identityFromRow, identityRow, normalizeRow, listIdentityRows, summaryFromRow, profileFromRow,
    assertJobSeekingInformation, assertRecruiterInformation, assertImageKeys, assertRecruitmentPost, assertManagedUser, assertMarketTarget,
    adminMarketContentQuery, assertMarketModerationDecision, marketMapQuery, marketListQuery,
    mapApplicantJobSeekingInformation, mapRecruiterInformation, multipartFile, detectImageContentType, readBuffer,
    decideReview, reviewRows, assertAdminAccountMutation, hasOwn,
    randomBytes, mkdir, readFile, writeFile, join,
    createUserForProvider, createSession, findSessionUser, findRoleProfileForUser, updateRoleProfile, grantReviewer,
    getApplicantJobSeekingInformation, upsertApplicantJobSeekingInformation, getRecruiterInformation, upsertRecruiterInformation,
    createMediaUpload, completeMediaUpload, listRecruitmentPosts, createRecruitmentPost, getRecruitmentPost, updateRecruitmentPost,
    listUsers, getUser, createManagedUser, updateManagedUser, disableUser,
    listMarketRecruitmentPosts, mapMarketRecruitmentPosts, getMarketRecruitmentPost, listMarketJobSeekingInformation, mapMarketJobSeekingInformation, getMarketJobSeekingInformation, getPublicRecruitmentImage,
    setMarketVisibility, renewMarketPublication, setFavorite, listFavorites, createMarketReport, createMarketUserBlock, listMarketUserBlocks, deleteMarketUserBlock,
    listMarketReports, listAdminMarketContent, listAdminAuditLogs, decideMarketContent, resolveMarketReport, recordContactView, recordAdminAudit,
    findAdminByLogin, findAdminById, findAdminSession, listAdminAccounts, createAdminAccount, updateAdminLogin, touchAdminLogin, createAdminSession, revokeAdminSession, verifyPassword, countActiveOwners,
    startConversation, listConversations, getConversation, listMessages, sendMessage, markConversationRead, endConversation,
    createApplication, listApplicationsForApplicant, listApplicationsForRecruiter, updateApplicationStatus, createInterview, listInterviews, respondInterview, cancelInterview,
    maxImageBytes, imageTypes, roles, statusValues, adminRoles,
  };

  const handler = async (request, response) => handleRequest(request, response, deps);
  handler.db = db;
  handler.grantReviewer = (userId) => grantReviewer(db, userId);
  handler.close = () => db.close();
  return handler;
}

