/**
 * Request validation and pure parse helpers for HTTP boundaries.
 * Domain write logic stays out of this module; throw httpError with stable codes.
 */
import {
  httpError,
  assertRequired,
  assertMaxLengths,
  assertPhone,
  assertCoordinates,
  text,
} from '../http.js';

export const roles = new Set(['recruiter', 'applicant']);
export const statusValues = new Set(['pending_review', 'approved', 'changes_requested']);
export const adminRoles = new Set(['owner', 'admin', 'reviewer', 'operator']);
export const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const maxImageBytes = 10 * 1024 * 1024;

const WORK_METHODS = new Set(['monthly_settlement', 'indefinite_duration']);
const ORGANIZATION_TYPES = new Set(['company', 'individual', 'other']);
const USER_STATUSES = new Set(['active', 'disabled']);
const MARKET_TARGET_TYPES = new Set(['recruitment_post', 'applicant_information']);
const MARKET_VISIBILITY_STATUSES = new Set(['published', 'pending_review', 'changes_requested', 'disabled']);
const MARKET_MODERATION_DECISIONS = new Set(['approve', 'request_changes', 'disable', 'restore']);
const IDENTITY_REVIEW_DECISIONS = new Set(['approved', 'changes_requested']);
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseLimit(value, { fallback, min, max, message }) {
  const limit = Number(value ?? fallback);
  if (!Number.isInteger(limit) || limit < min || limit > max) {
    throw httpError(422, 'VALIDATION_ERROR', message);
  }
  return limit;
}

export function assertJobSeekingInformation(body) {
  assertRequired(body, ['jobTypeName', 'expectedSalary', 'workMethod', 'locationText']);
  assertMaxLengths(body, {
    jobTypeName: 120,
    expectedSalary: 100,
    locationText: 200,
    preferredWorkScope: 200,
  });
  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 1 || age > 120) {
    throw httpError(422, 'VALIDATION_ERROR', '年龄必须是 1 到 120 的整数');
  }
  if (!WORK_METHODS.has(text(body.workMethod))) {
    throw httpError(422, 'VALIDATION_ERROR', '工作方式无效');
  }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  assertCoordinates(latitude, longitude);
  return {
    jobTypeName: text(body.jobTypeName),
    age,
    expectedSalary: text(body.expectedSalary),
    workMethod: text(body.workMethod),
    locationText: text(body.locationText),
    latitude,
    longitude,
    preferredWorkScope: text(body.preferredWorkScope),
  };
}

export function assertRecruiterInformation(body) {
  assertRequired(body, ['detailedAddress']);
  assertMaxLengths(body, { detailedAddress: 300 });
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  assertCoordinates(latitude, longitude);
  return { latitude, longitude, detailedAddress: text(body.detailedAddress) };
}

export function assertImageKeys(imageKeys) {
  if (!Array.isArray(imageKeys) || imageKeys.length > 6 || imageKeys.some((key) => !text(key))) {
    throw httpError(422, 'VALIDATION_ERROR', '图片最多上传 6 张');
  }
  return imageKeys.map(text);
}

export function assertRecruitmentPost(body) {
  assertRequired(body, ['jobType', 'salaryRange', 'settlementMethod', 'locationText']);
  assertMaxLengths(body, {
    jobType: 120,
    salaryRange: 100,
    settlementMethod: 100,
    locationText: 200,
  });
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  assertCoordinates(latitude, longitude);
  return {
    jobType: text(body.jobType),
    salaryRange: text(body.salaryRange),
    settlementMethod: text(body.settlementMethod),
    locationText: text(body.locationText),
    latitude,
    longitude,
    imageKeys: assertImageKeys(body.imageKeys || []),
  };
}

export function assertManagedUser(body, partial = false) {
  if (!partial) assertRequired(body, ['email', 'name']);
  assertMaxLengths(body, { email: 160, name: 120 });
  if (body.email !== undefined && !EMAIL_PATTERN.test(text(body.email))) {
    throw httpError(422, 'VALIDATION_ERROR', '邮箱格式无效');
  }
  if (body.name !== undefined && !text(body.name)) {
    throw httpError(422, 'VALIDATION_ERROR', '姓名不能为空');
  }
  if (body.status !== undefined && !USER_STATUSES.has(text(body.status))) {
    throw httpError(422, 'VALIDATION_ERROR', '用户状态无效');
  }
  return {
    ...(body.email !== undefined ? { email: text(body.email) } : {}),
    ...(body.name !== undefined ? { name: text(body.name) } : {}),
    ...(body.status !== undefined ? { status: text(body.status) } : {}),
  };
}

export function assertMarketTarget(body) {
  if (!MARKET_TARGET_TYPES.has(text(body.targetType))) {
    throw httpError(422, 'VALIDATION_ERROR', '举报对象类型无效');
  }
  assertRequired(body, ['targetId', 'reason']);
  assertMaxLengths(body, { targetId: 200, reason: 1000 });
  return {
    targetType: text(body.targetType),
    targetId: text(body.targetId),
    reason: text(body.reason),
  };
}

export function adminMarketContentQuery(url) {
  const targetType = text(url.searchParams.get('targetType'));
  const status = text(url.searchParams.get('status'));
  const publishedFromValue = text(url.searchParams.get('publishedFrom'));
  const publishedToValue = text(url.searchParams.get('publishedTo'));
  if (targetType && !MARKET_TARGET_TYPES.has(targetType)) {
    throw httpError(422, 'VALIDATION_ERROR', '市场内容类型无效');
  }
  if (status && !MARKET_VISIBILITY_STATUSES.has(status)) {
    throw httpError(422, 'VALIDATION_ERROR', '市场内容状态无效');
  }
  const limit = parseLimit(url.searchParams.get('limit') || 100, {
    fallback: 100,
    min: 1,
    max: 200,
    message: '发布时间范围或数量限制无效',
  });
  if ((publishedFromValue && Number.isNaN(Date.parse(publishedFromValue)))
    || (publishedToValue && Number.isNaN(Date.parse(publishedToValue)))) {
    throw httpError(422, 'VALIDATION_ERROR', '发布时间范围或数量限制无效');
  }
  const publishedFrom = publishedFromValue ? new Date(publishedFromValue).toISOString() : null;
  const publishedTo = publishedToValue ? new Date(publishedToValue).toISOString() : null;
  if (publishedFrom && publishedTo && publishedFrom > publishedTo) {
    throw httpError(422, 'VALIDATION_ERROR', '发布时间范围无效');
  }
  return { targetType, status, publishedFrom, publishedTo, limit };
}

export function assertMarketModerationDecision(body) {
  const decision = text(body.decision);
  const reason = text(body.reason);
  if (!MARKET_MODERATION_DECISIONS.has(decision)) {
    throw httpError(422, 'VALIDATION_ERROR', '内容审核决定无效');
  }
  if (reason.length > 1000) {
    throw httpError(422, 'VALIDATION_ERROR', '审核原因不能超过 1000 个字符');
  }
  if (decision === 'request_changes' && !reason) {
    throw httpError(422, 'VALIDATION_ERROR', '打回时必须填写原因');
  }
  return { decision, reason };
}

export function assertIdentityReviewDecision(decision, reason) {
  const nextDecision = text(decision);
  const nextReason = text(reason);
  if (!IDENTITY_REVIEW_DECISIONS.has(nextDecision)) {
    throw httpError(422, 'VALIDATION_ERROR', '审核决定无效');
  }
  if (nextDecision === 'changes_requested' && !nextReason) {
    throw httpError(422, 'VALIDATION_ERROR', '要求修改时必须填写原因');
  }
  return {
    decision: nextDecision,
    reason: nextDecision === 'changes_requested' ? nextReason : (nextReason || null),
  };
}

export function marketMapQuery(url) {
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

export function marketListQuery(url) {
  const limit = Number(url.searchParams.get('limit') || 20);
  const sort = text(url.searchParams.get('sort')) || 'newest';
  const publishedFromRaw = url.searchParams.get('publishedFrom');
  const publishedToRaw = url.searchParams.get('publishedTo');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || sort !== 'newest'
    || (publishedFromRaw && Number.isNaN(Date.parse(publishedFromRaw)))
    || (publishedToRaw && Number.isNaN(Date.parse(publishedToRaw)))) {
    throw httpError(422, 'VALIDATION_ERROR', '列表数量或排序方式无效');
  }
  return {
    cursor: url.searchParams.get('cursor'),
    limit,
    keyword: text(url.searchParams.get('keyword')),
    publishedFrom: publishedFromRaw ? new Date(publishedFromRaw).toISOString() : null,
    publishedTo: publishedToRaw ? new Date(publishedToRaw).toISOString() : null,
  };
}

export function validateProfile(role, body) {
  if (role === 'recruiter') {
    assertRequired(body, [
      'organizationName',
      'organizationType',
      'contactName',
      'contactPhone',
      'region',
      'industryOrJobDirection',
    ]);
    assertMaxLengths(body, {
      organizationName: 120,
      contactName: 80,
      contactPhone: 32,
      region: 120,
      industryOrJobDirection: 120,
    });
    if (!ORGANIZATION_TYPES.has(text(body.organizationType))) {
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
  assertRequired(body, [
    'displayName',
    'contactPhone',
    'region',
    'desiredJob',
    'experienceSummary',
    'preferredRegionOrTime',
  ]);
  assertMaxLengths(body, {
    displayName: 80,
    contactPhone: 32,
    region: 120,
    desiredJob: 120,
    experienceSummary: 2000,
    preferredRegionOrTime: 200,
  });
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

export async function readBuffer(request, { maxBytes = maxImageBytes + 1024 * 1024 } = {}) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw httpError(413, 'PAYLOAD_TOO_LARGE', '图片内容过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function multipartFile(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) throw httpError(400, 'INVALID_MULTIPART', '图片上传格式无效');
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'));
  const closing = buffer.lastIndexOf(boundary);
  if (headerEnd < 0 || closing <= headerEnd) {
    throw httpError(400, 'INVALID_MULTIPART', '图片内容无效');
  }
  const dataEnd = buffer.lastIndexOf(Buffer.from('\r\n'), closing);
  return buffer.subarray(headerEnd + 4, dataEnd >= headerEnd + 4 ? dataEnd : closing);
}

export function detectImageContentType(file) {
  if (file.length >= 3 && file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return 'image/jpeg';
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (file.length >= 12 && file.subarray(0, 4).toString('ascii') === 'RIFF'
    && file.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

// --- Collaboration (messaging / applications / interviews) ---

const APPLICATION_STATUSES = new Set([
  'submitted', 'viewed', 'contacted', 'interviewing', 'hired', 'rejected', 'withdrawn', 'closed',
]);
const INTERVIEW_RESPONSES = new Set(['accept', 'decline']);

export function assertConversationTarget(body) {
  if (!MARKET_TARGET_TYPES.has(text(body.targetType)) || !text(body.targetId)) {
    throw httpError(422, 'VALIDATION_ERROR', '沟通目标无效');
  }
  return {
    targetType: text(body.targetType),
    targetId: text(body.targetId),
    body: body.body,
    clientRequestId: text(body.clientRequestId) || null,
  };
}

export function assertMessageBody(body, { maxLength = 1000 } = {}) {
  const message = text(body);
  if (!message || message.length > maxLength) {
    throw httpError(422, 'VALIDATION_ERROR', '消息内容无效');
  }
  return message;
}

export function assertApplicationCreate(body) {
  const recruitmentPostId = text(body.recruitmentPostId);
  if (!recruitmentPostId) {
    throw httpError(422, 'VALIDATION_ERROR', '缺少招聘信息');
  }
  // Preserve historical truncate semantics for overlong notes.
  return { recruitmentPostId, note: text(body.note).slice(0, 500) };
}

export function assertApplicationStatus(status) {
  const next = text(status);
  if (!APPLICATION_STATUSES.has(next)) {
    throw httpError(422, 'VALIDATION_ERROR', '投递状态无效');
  }
  return next;
}

export function assertInterviewCreate(body) {
  const applicantUserId = text(body.applicantUserId);
  const scheduledAtRaw = text(body.scheduledAt);
  const locationText = text(body.locationText);
  const applicationId = text(body.applicationId) || null;
  if (!applicantUserId) {
    throw httpError(422, 'VALIDATION_ERROR', '缺少应聘方');
  }
  if (!scheduledAtRaw || Number.isNaN(Date.parse(scheduledAtRaw))) {
    throw httpError(422, 'VALIDATION_ERROR', '面试时间无效');
  }
  if (!locationText || locationText.length > 200) {
    throw httpError(422, 'VALIDATION_ERROR', '面试地点无效');
  }
  return {
    applicationId,
    applicantUserId,
    scheduledAt: new Date(scheduledAtRaw).toISOString(),
    locationText,
  };
}

export function assertInterviewResponseDecision(decision) {
  const next = text(decision);
  if (!INTERVIEW_RESPONSES.has(next)) {
    throw httpError(422, 'VALIDATION_ERROR', '响应决定无效');
  }
  return next;
}

export function assertInterviewCancelReason(reason, { maxLength = 500 } = {}) {
  const cancelReason = text(reason);
  if (!cancelReason || cancelReason.length > maxLength) {
    throw httpError(422, 'VALIDATION_ERROR', '取消原因必填');
  }
  return cancelReason;
}

