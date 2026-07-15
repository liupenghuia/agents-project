import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { now, defaultExpiresAt, isPublicationActive, notExpiredSql } from './time.js';
import { publicApplicantPredicate, publicRecruitmentPredicate } from './visibility.js';

export function grantReviewer(db, userId) {
  db.prepare(`
    INSERT OR IGNORE INTO reviewer_permissions(user_id, permission, created_at)
    VALUES (?, 'identity_review', ?)
  `).run(userId, now());
}

export function createUserForProvider(db, providerSubject, unionId = null) {
  const timestamp = now();
  const existing = db.prepare(`
    SELECT u.id, u.status
    FROM auth_accounts a JOIN users u ON u.id = a.user_id
    WHERE a.provider = 'wechat' AND a.provider_subject = ?
  `).get(providerSubject);

  if (existing) {
    db.prepare('UPDATE auth_accounts SET last_login_at = ?, union_id = COALESCE(?, union_id) WHERE provider = \'wechat\' AND provider_subject = ?')
      .run(timestamp, unionId, providerSubject);
    return existing;
  }

  const userId = randomUUID();
  const accountId = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO users(id, email, name, status, created_at, updated_at) VALUES (?, NULL, ?, \'active\', ?, ?)')
      .run(userId, '微信用户', timestamp, timestamp);
    db.prepare('INSERT INTO auth_accounts(id, user_id, provider, provider_subject, union_id, created_at, last_login_at) VALUES (?, ?, \'wechat\', ?, ?, ?, ?)')
      .run(accountId, userId, providerSubject, unionId, timestamp, timestamp);
    db.exec('COMMIT');
    return { id: userId, status: 'active' };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createSession(db, userId, tokenHash, expiresAt, sessionId = randomUUID()) {
  db.prepare(`
    INSERT INTO sessions(id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, tokenHash, expiresAt, now());
}

export function findSessionUser(db, tokenHash) {
  return db.prepare(`
    SELECT u.id, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
  `).get(tokenHash, now()) || null;
}

export function findRoleProfileForUser(db, userId, role) {
  return db.prepare('SELECT id, user_id, role FROM role_profiles WHERE user_id = ? AND role = ?').get(userId, role) || null;
}

export function updateRoleProfile(db, userId, identityId, role, profile) {
  const owner = db.prepare('SELECT id FROM role_profiles WHERE id = ? AND user_id = ? AND role = ?').get(identityId, userId, role);
  if (!owner) return false;
  const timestamp = now();
  db.exec('BEGIN');
  try {
    if (role === 'recruiter') {
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
    db.prepare('UPDATE role_profiles SET updated_at = ? WHERE id = ?').run(timestamp, identityId);
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function roleProfileForUser(db, userId, role) {
  const profile = findRoleProfileForUser(db, userId, role);
  if (!profile) {
    const error = new Error(`需要先创建${role === 'applicant' ? '应聘' : '招人'}身份`);
    error.status = 403;
    error.code = 'IDENTITY_REQUIRED';
    throw error;
  }
  return profile;
}

function locationValid(latitude, longitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function getApplicantJobSeekingInformation(db, userId) {
  const profile = roleProfileForUser(db, userId, 'applicant');
  return db.prepare('SELECT * FROM applicant_job_seeking_information WHERE role_profile_id = ?').get(profile.id) || null;
}

export function upsertApplicantJobSeekingInformation(db, userId, data) {
  const profile = roleProfileForUser(db, userId, 'applicant');
  if (!locationValid(data.latitude, data.longitude)) throw new Error('INVALID_COORDINATES');
  const timestamp = now();
  const expiresAt = defaultExpiresAt(timestamp);
  db.prepare(`INSERT INTO applicant_job_seeking_information(
      role_profile_id, job_type_name, age, expected_salary, work_method, location_text,
      latitude, longitude, preferred_work_scope, visibility_status, published_at, disabled_at, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, NULL, ?, ?, ?)
    ON CONFLICT(role_profile_id) DO UPDATE SET
      job_type_name = excluded.job_type_name, age = excluded.age, expected_salary = excluded.expected_salary,
      work_method = excluded.work_method, location_text = excluded.location_text, latitude = excluded.latitude,
      longitude = excluded.longitude, preferred_work_scope = excluded.preferred_work_scope,
      visibility_status = CASE
        WHEN applicant_job_seeking_information.visibility_status = 'changes_requested' THEN 'pending_review'
        WHEN applicant_job_seeking_information.visibility_status = 'pending_review' THEN 'pending_review'
        WHEN applicant_job_seeking_information.visibility_status = 'disabled'
          AND applicant_job_seeking_information.moderated_by IS NOT NULL THEN 'disabled'
        ELSE 'published'
      END,
      disabled_at = CASE
        WHEN applicant_job_seeking_information.visibility_status = 'disabled'
          AND applicant_job_seeking_information.moderated_by IS NOT NULL
          THEN applicant_job_seeking_information.disabled_at
        ELSE NULL
      END,
      published_at = COALESCE(applicant_job_seeking_information.published_at, excluded.published_at),
      expires_at = CASE
        WHEN applicant_job_seeking_information.visibility_status IN ('disabled', 'changes_requested')
          AND (applicant_job_seeking_information.expires_at IS NULL OR applicant_job_seeking_information.expires_at <= excluded.updated_at)
          THEN excluded.expires_at
        WHEN applicant_job_seeking_information.expires_at IS NULL THEN excluded.expires_at
        ELSE applicant_job_seeking_information.expires_at
      END,
      updated_at = excluded.updated_at`)
    .run(profile.id, data.jobTypeName, data.age, data.expectedSalary, data.workMethod, data.locationText,
      data.latitude, data.longitude, data.preferredWorkScope || null, timestamp, expiresAt, timestamp, timestamp);
  return getApplicantJobSeekingInformation(db, userId);
}

export function getRecruiterInformation(db, userId) {
  const profile = roleProfileForUser(db, userId, 'recruiter');
  return db.prepare('SELECT * FROM recruiter_information WHERE role_profile_id = ?').get(profile.id) || null;
}

export function upsertRecruiterInformation(db, userId, data) {
  const profile = roleProfileForUser(db, userId, 'recruiter');
  if (!locationValid(data.latitude, data.longitude)) throw new Error('INVALID_COORDINATES');
  const timestamp = now();
  db.prepare(`INSERT INTO recruiter_information(role_profile_id, latitude, longitude, detailed_address, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(role_profile_id) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude,
      detailed_address = excluded.detailed_address, updated_at = excluded.updated_at`)
    .run(profile.id, data.latitude, data.longitude, data.detailedAddress, timestamp, timestamp);
  return getRecruiterInformation(db, userId);
}

export function createMediaUpload(db, userId, { objectKey, contentType, byteSize, expiresAt }) {
  db.prepare(`INSERT INTO media_uploads(object_key, user_id, content_type, byte_size, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(objectKey, userId, contentType, byteSize, expiresAt, now());
  return { objectKey, contentType, byteSize, expiresAt };
}

export function completeMediaUpload(db, userId, objectKey, byteSize, contentType) {
  const upload = db.prepare('SELECT * FROM media_uploads WHERE object_key = ? AND user_id = ?').get(objectKey, userId);
  if (!upload || upload.expires_at <= now() || upload.completed_at) return null;
  if (byteSize > upload.byte_size || contentType !== upload.content_type) return null;
  db.prepare('UPDATE media_uploads SET completed_at = ?, byte_size = ? WHERE object_key = ?').run(now(), byteSize, objectKey);
  return { ...upload, byte_size: byteSize };
}

function recruitmentPostFromRow(db, row) {
  if (!row) return null;
  return {
    id: row.id,
    recruiterRoleProfileId: row.recruiter_role_profile_id,
    jobType: row.job_type,
    salaryRange: row.salary_range,
    settlementMethod: row.settlement_method,
    locationText: row.location_text,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    publishedAt: row.published_at || row.created_at,
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(row.disabled_at ? { disabledAt: row.disabled_at } : {}),
    ...(row.moderation_reason ? { moderationReason: row.moderation_reason } : {}),
    ...(row.moderated_at ? { moderatedAt: row.moderated_at } : {}),
    images: db.prepare(`SELECT id, object_key, content_type, byte_size, sort_order FROM recruitment_post_images
      WHERE recruitment_post_id = ? ORDER BY sort_order ASC`).all(row.id).map((image) => ({
      id: image.id, objectKey: image.object_key, contentType: image.content_type,
      byteSize: image.byte_size, sortOrder: image.sort_order,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recruiterProfileForUser(db, userId) {
  return roleProfileForUser(db, userId, 'recruiter');
}

export function listRecruitmentPosts(db, userId) {
  const profile = recruiterProfileForUser(db, userId);
  return db.prepare('SELECT * FROM recruitment_posts WHERE recruiter_role_profile_id = ? ORDER BY created_at DESC')
    .all(profile.id).map((row) => recruitmentPostFromRow(db, row));
}

export function getRecruitmentPost(db, userId, postId) {
  const profile = recruiterProfileForUser(db, userId);
  const row = db.prepare('SELECT * FROM recruitment_posts WHERE id = ? AND recruiter_role_profile_id = ?').get(postId, profile.id);
  return recruitmentPostFromRow(db, row);
}

function validateUploadKeys(db, userId, imageKeys) {
  if (!Array.isArray(imageKeys) || imageKeys.length > 6 || new Set(imageKeys).size !== imageKeys.length) return null;
  const uploads = imageKeys.map((key) => db.prepare(`SELECT * FROM media_uploads WHERE object_key = ? AND user_id = ?
    AND completed_at IS NOT NULL AND expires_at > ?`).get(key, userId, now()));
  return uploads.every(Boolean) ? uploads : null;
}

export function createRecruitmentPost(db, userId, data) {
  const profile = recruiterProfileForUser(db, userId);
  const uploads = validateUploadKeys(db, userId, data.imageKeys);
  if (!uploads) throw new Error('INVALID_IMAGE_REFERENCES');
  const timestamp = now();
  const expiresAt = defaultExpiresAt(timestamp);
  const postId = randomBytes(16).toString('hex');
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO recruitment_posts(id, recruiter_role_profile_id, job_type, salary_range, settlement_method,
      location_text, latitude, longitude, status, published_at, disabled_at, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, NULL, ?, ?, ?)`).run(postId, profile.id, data.jobType, data.salaryRange,
    data.settlementMethod, data.locationText, data.latitude, data.longitude, timestamp, expiresAt, timestamp, timestamp);
    data.imageKeys.forEach((key, index) => {
      const upload = uploads[index];
      db.prepare(`INSERT INTO recruitment_post_images(id, recruitment_post_id, object_key, content_type, byte_size, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomBytes(16).toString('hex'), postId, key, upload.content_type, upload.byte_size, index, timestamp);
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getRecruitmentPost(db, userId, postId);
}

export function updateRecruitmentPost(db, userId, postId, data) {
  const current = getRecruitmentPost(db, userId, postId);
  if (!current) return null;
  const next = { ...current, ...data, imageKeys: data.imageKeys || current.images.map((image) => image.objectKey) };
  const uploads = validateUploadKeys(db, userId, next.imageKeys);
  if (!uploads) throw new Error('INVALID_IMAGE_REFERENCES');
  const timestamp = now();
  db.exec('BEGIN');
  try {
    const renewExpiry = !isPublicationActive(current.expiresAt, timestamp) || current.status === 'disabled';
    db.prepare(`UPDATE recruitment_posts SET job_type = ?, salary_range = ?, settlement_method = ?, location_text = ?,
      latitude = ?, longitude = ?,
      status = CASE
        WHEN status = 'changes_requested' THEN 'pending_review'
        WHEN status = 'pending_review' THEN 'pending_review'
        WHEN status = 'disabled' AND moderated_by IS NULL THEN 'published'
        ELSE status
      END,
      disabled_at = CASE WHEN status = 'disabled' AND moderated_by IS NOT NULL THEN disabled_at ELSE NULL END,
      expires_at = CASE WHEN ? THEN ? ELSE COALESCE(expires_at, ?) END,
      updated_at = ? WHERE id = ?`).run(next.jobType, next.salaryRange, next.settlementMethod,
      next.locationText, next.latitude, next.longitude, renewExpiry ? 1 : 0, defaultExpiresAt(timestamp), defaultExpiresAt(timestamp), timestamp, postId);
    db.prepare('DELETE FROM recruitment_post_images WHERE recruitment_post_id = ?').run(postId);
    next.imageKeys.forEach((key, index) => {
      const upload = uploads[index];
      db.prepare(`INSERT INTO recruitment_post_images(id, recruitment_post_id, object_key, content_type, byte_size, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomBytes(16).toString('hex'), postId, key, upload.content_type, upload.byte_size, index, timestamp);
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getRecruitmentPost(db, userId, postId);
}

function publicUser(row) {
  return row ? { id: row.id, email: row.email, name: row.name, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

export function listUsers(db) {
  return db.prepare(`SELECT u.id, u.email, u.name, u.status, u.created_at, u.updated_at
    FROM users u LEFT JOIN admin_accounts aa ON aa.user_id = u.id
    WHERE aa.user_id IS NULL ORDER BY u.created_at DESC`).all().map(publicUser);
}

export function getUser(db, userId) {
  return publicUser(db.prepare(`SELECT u.id, u.email, u.name, u.status, u.created_at, u.updated_at
    FROM users u LEFT JOIN admin_accounts aa ON aa.user_id = u.id
    WHERE u.id = ? AND aa.user_id IS NULL`).get(userId));
}

export function createManagedUser(db, { email, name }) {
  const timestamp = now();
  const id = randomUUID();
  db.prepare('INSERT INTO users(id, email, name, status, created_at, updated_at) VALUES (?, ?, ?, \'active\', ?, ?)')
    .run(id, email, name, timestamp, timestamp);
  return getUser(db, id);
}

export function updateManagedUser(db, userId, { email, name, status }) {
  const current = getUser(db, userId);
  if (!current) return null;
  const timestamp = now();
  db.prepare('UPDATE users SET email = COALESCE(?, email), name = COALESCE(?, name), status = COALESCE(?, status), updated_at = ? WHERE id = ?')
    .run(email ?? null, name ?? null, status ?? null, timestamp, userId);
  if (status === 'disabled') {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(timestamp, userId);
  }
  return getUser(db, userId);
}

export function disableUser(db, userId) {
  return updateManagedUser(db, userId, { status: 'disabled' });
}

function marketRole(db, userId, role) { return roleProfileForUser(db, userId, role); }

function approvedCounterpart(db, userId, role) {
  return db.prepare("SELECT id FROM role_profiles WHERE user_id = ? AND role = ? AND review_status = 'approved'").get(userId, role) || null;
}

function applicantMarketRow(row, includeContact = false) {
  if (!row) return null;
  const active = isPublicationActive(row.expires_at);
  const result = {
    id: row.role_profile_id, jobTypeName: row.job_type_name, age: row.age, expectedSalary: row.expected_salary,
    workMethod: row.work_method, locationText: row.location_text,
    status: active ? row.visibility_status : 'expired', publishedAt: row.published_at || row.created_at, updatedAt: row.updated_at,
    isFavorited: Boolean(row.is_favorited),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(row.preferred_work_scope ? { preferredWorkScope: row.preferred_work_scope } : {}),
  };
  if (includeContact && active) {
    result.contactName = row.contact_name;
    result.contactPhone = row.contact_phone;
  }
  return result;
}

function publicRecruitmentImages(db, postId) {
  return db.prepare(`SELECT id, content_type, sort_order FROM recruitment_post_images
    WHERE recruitment_post_id = ? ORDER BY sort_order`).all(postId).map((image) => ({
    id: image.id,
    url: `/market/media/${image.id}`,
    contentType: image.content_type,
    sortOrder: image.sort_order,
  }));
}

function recruiterMarketRow(db, row, includeContact = false) {
  if (!row) return null;
  const active = isPublicationActive(row.expires_at);
  const images = publicRecruitmentImages(db, row.id);
  const result = {
    id: row.id, jobType: row.job_type, salaryRange: row.salary_range, settlementMethod: row.settlement_method,
    locationText: row.location_text, status: active ? row.status : 'expired', publishedAt: row.published_at || row.created_at,
    updatedAt: row.updated_at, isFavorited: Boolean(row.is_favorited), images,
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
    ...(images[0] ? { coverImage: images[0].url } : {}),
  };
  if (includeContact && active) {
    result.contactName = row.contact_name;
    result.contactPhone = row.contact_phone;
  }
  return result;
}

function assertMarketViewer(db, userId, targetRole) {
  const profile = approvedCounterpart(db, userId, targetRole);
  if (!profile) throw new Error('COUNTERPART_IDENTITY_REQUIRED');
  return profile;
}

function invalidMarketCursor() {
  const error = new Error('市场列表游标无效');
  error.status = 422;
  error.code = 'INVALID_MARKET_CURSOR';
  return error;
}

function decodeMarketCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!value || typeof value.publishedAt !== 'string' || !value.publishedAt
      || typeof value.id !== 'string' || !value.id || Number.isNaN(Date.parse(value.publishedAt))) {
      throw invalidMarketCursor();
    }
    return value;
  } catch (error) {
    if (error.code === 'INVALID_MARKET_CURSOR') throw error;
    throw invalidMarketCursor();
  }
}

function encodeMarketCursor(row, idField) {
  return Buffer.from(JSON.stringify({
    publishedAt: row.published_at || row.created_at,
    id: row[idField],
  })).toString('base64url');
}

export function listMarketRecruitmentPosts(db, userId, {
  cursor = null, limit = 20, keyword = '', jobType = '', salaryRange = '', settlementMethod = '', location = '', publishedFrom = null, publishedTo = null,
} = {}) {
  const viewer = assertMarketViewer(db, userId, 'applicant');
  const decoded = decodeMarketCursor(cursor);
  const pageSize = Math.min(Math.max(limit, 1), 50);
  const timestamp = now();
  const filterArgs = [timestamp, userId, keyword, `%${keyword}%`, jobType, `%${jobType}%`, salaryRange, `%${salaryRange}%`,
    settlementMethod, settlementMethod, location, `%${location}%`, publishedFrom, publishedFrom, publishedTo, publishedTo];
  const totalCount = db.prepare(`SELECT COUNT(*) AS count
    FROM recruitment_posts rp
    JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id AND role.review_status = 'approved'
    WHERE ${publicRecruitmentPredicate('rp')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.salary_range LIKE ?)
      AND (? = '' OR rp.settlement_method = ?)
      AND (? = '' OR rp.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) >= ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) <= ?)`)
    .get(...filterArgs).count;
  const rows = db.prepare(`SELECT rp.*, r.contact_name, r.contact_phone,
      EXISTS(SELECT 1 FROM applicant_favorites f
        WHERE f.applicant_role_profile_id = ? AND f.recruitment_post_id = rp.id) AS is_favorited
    FROM recruitment_posts rp
    JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id AND role.review_status = 'approved'
    JOIN recruiter_profiles r ON r.role_profile_id = rp.recruiter_role_profile_id
    WHERE ${publicRecruitmentPredicate('rp')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.salary_range LIKE ?)
      AND (? = '' OR rp.settlement_method = ?)
      AND (? = '' OR rp.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) >= ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) <= ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) < ?
        OR (COALESCE(rp.published_at, rp.created_at) = ? AND rp.id < ?))
    ORDER BY COALESCE(rp.published_at, rp.created_at) DESC, rp.id DESC LIMIT ?`)
    .all(viewer.id, timestamp, userId, keyword, `%${keyword}%`, jobType, `%${jobType}%`, salaryRange, `%${salaryRange}%`,
      settlementMethod, settlementMethod, location, `%${location}%`, publishedFrom, publishedFrom, publishedTo, publishedTo, decoded?.publishedAt ?? null,
      decoded?.publishedAt ?? null, decoded?.publishedAt ?? null, decoded?.id ?? null, pageSize + 1);
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  return {
    items: items.map((row) => recruiterMarketRow(db, row)),
    totalCount,
    nextCursor: hasMore ? encodeMarketCursor(items.at(-1), 'id') : null,
  };
}

export function getMarketRecruitmentPost(db, userId, postId) {
  const viewer = assertMarketViewer(db, userId, 'applicant');
  const timestamp = now();
  const row = db.prepare(`SELECT rp.*, r.contact_name, r.contact_phone,
      EXISTS(SELECT 1 FROM applicant_favorites f
        WHERE f.applicant_role_profile_id = ? AND f.recruitment_post_id = rp.id) AS is_favorited
    FROM recruitment_posts rp JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id
    JOIN recruiter_profiles r ON r.role_profile_id = rp.recruiter_role_profile_id
    WHERE rp.id = ? AND ${publicRecruitmentPredicate('rp')} AND role.review_status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)`).get(viewer.id, postId, timestamp, userId);
  if (!row) return null;
  return recruiterMarketRow(db, row, true);
}

export function listMarketJobSeekingInformation(db, userId, {
  cursor = null, limit = 20, keyword = '', jobTypeName = '', expectedSalary = '', workMethod = '', location = '', publishedFrom = null, publishedTo = null,
} = {}) {
  const viewer = assertMarketViewer(db, userId, 'recruiter');
  const decoded = decodeMarketCursor(cursor);
  const pageSize = Math.min(Math.max(limit, 1), 50);
  const timestamp = now();
  const filterArgs = [timestamp, userId, keyword, `%${keyword}%`, jobTypeName, `%${jobTypeName}%`, expectedSalary, `%${expectedSalary}%`,
    workMethod, workMethod, location, `%${location}%`, publishedFrom, publishedFrom, publishedTo, publishedTo];
  const totalCount = db.prepare(`SELECT COUNT(*) AS count
    FROM applicant_job_seeking_information i
    JOIN role_profiles role ON role.id = i.role_profile_id AND role.review_status = 'approved'
    WHERE ${publicApplicantPredicate('i')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.expected_salary LIKE ?)
      AND (? = '' OR i.work_method = ?)
      AND (? = '' OR i.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) >= ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) <= ?)`)
    .get(...filterArgs).count;
  const rows = db.prepare(`SELECT i.*, a.display_name AS contact_name, a.contact_phone,
      EXISTS(SELECT 1 FROM recruiter_favorites f
        WHERE f.recruiter_role_profile_id = ? AND f.applicant_information_role_profile_id = i.role_profile_id) AS is_favorited
    FROM applicant_job_seeking_information i
    JOIN role_profiles role ON role.id = i.role_profile_id AND role.review_status = 'approved'
    JOIN applicant_profiles a ON a.role_profile_id = i.role_profile_id
    WHERE ${publicApplicantPredicate('i')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.expected_salary LIKE ?)
      AND (? = '' OR i.work_method = ?)
      AND (? = '' OR i.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) >= ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) <= ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) < ?
        OR (COALESCE(i.published_at, i.created_at) = ? AND i.role_profile_id < ?))
    ORDER BY COALESCE(i.published_at, i.created_at) DESC, i.role_profile_id DESC LIMIT ?`)
    .all(viewer.id, timestamp, userId, keyword, `%${keyword}%`, jobTypeName, `%${jobTypeName}%`, expectedSalary, `%${expectedSalary}%`,
      workMethod, workMethod, location, `%${location}%`, publishedFrom, publishedFrom, publishedTo, publishedTo, decoded?.publishedAt ?? null,
      decoded?.publishedAt ?? null, decoded?.publishedAt ?? null, decoded?.id ?? null, pageSize + 1);
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  return {
    items: items.map((row) => applicantMarketRow(row)),
    totalCount,
    nextCursor: hasMore ? encodeMarketCursor(items.at(-1), 'role_profile_id') : null,
  };
}

export function getMarketJobSeekingInformation(db, userId, informationId) {
  const viewer = assertMarketViewer(db, userId, 'recruiter');
  const timestamp = now();
  const row = db.prepare(`SELECT i.*, a.display_name AS contact_name, a.contact_phone,
      EXISTS(SELECT 1 FROM recruiter_favorites f
        WHERE f.recruiter_role_profile_id = ? AND f.applicant_information_role_profile_id = i.role_profile_id) AS is_favorited
    FROM applicant_job_seeking_information i JOIN role_profiles role ON role.id = i.role_profile_id
    JOIN applicant_profiles a ON a.role_profile_id = i.role_profile_id
    WHERE i.role_profile_id = ? AND ${publicApplicantPredicate('i')}
      AND role.review_status = 'approved'
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)`)
    .get(viewer.id, informationId, timestamp, userId);
  return applicantMarketRow(row, Boolean(row));
}

export function getPublicRecruitmentImage(db, imageId) {
  const timestamp = now();
  return db.prepare(`SELECT image.object_key, image.content_type
    FROM recruitment_post_images image
    JOIN recruitment_posts post ON post.id = image.recruitment_post_id AND ${publicRecruitmentPredicate('post')}
    JOIN role_profiles role ON role.id = post.recruiter_role_profile_id AND role.review_status = 'approved'
    WHERE image.id = ?`).get(timestamp, imageId) || null;
}

const mapGridSize = (zoom) => Math.max(0.01, 360 / (2 ** (zoom + 3)));

function projectedCell(latitude, longitude, zoom) {
  const size = mapGridSize(zoom);
  const latitudeIndex = Math.floor((latitude + 90) / size);
  const longitudeIndex = Math.floor((longitude + 180) / size);
  return {
    key: `${latitudeIndex}:${longitudeIndex}`,
    latitude: Number((((latitudeIndex + 0.5) * size) - 90).toFixed(6)),
    longitude: Number((((longitudeIndex + 0.5) * size) - 180).toFixed(6)),
  };
}

function aggregateMarketMap(rows, zoom, limit, mapSingle) {
  const cells = new Map();
  rows.forEach((row) => {
    const projection = projectedCell(row.latitude, row.longitude, zoom);
    const cell = cells.get(projection.key) || { ...projection, rows: [] };
    cell.rows.push(row);
    cells.set(projection.key, cell);
  });
  const items = Array.from(cells.values()).slice(0, limit).map((cell) => {
    if (cell.rows.length > 1) {
      return { cluster: true, count: cell.rows.length, latitude: cell.latitude, longitude: cell.longitude };
    }
    return { ...mapSingle(cell.rows[0]), cluster: false, latitude: cell.latitude, longitude: cell.longitude };
  });
  return { items, zoom, nextCursor: null };
}

export function mapMarketRecruitmentPosts(db, userId, bounds, { zoom, limit = 50, jobType = '', salaryRange = '', location = '', publishedFrom = null, publishedTo = null } = {}) {
  assertMarketViewer(db, userId, 'applicant');
  const timestamp = now();
  const rows = db.prepare(`SELECT rp.id, rp.job_type, rp.salary_range, rp.settlement_method, rp.location_text,
      rp.latitude, rp.longitude, rp.status, rp.published_at, rp.created_at
    FROM recruitment_posts rp
    JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id AND role.review_status = 'approved'
    WHERE ${publicRecruitmentPredicate('rp')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND rp.latitude BETWEEN ? AND ? AND rp.longitude BETWEEN ? AND ?
      AND (? = '' OR rp.job_type LIKE ?)
      AND (? = '' OR rp.salary_range LIKE ?)
      AND (? = '' OR rp.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) >= ?)
      AND (? IS NULL OR COALESCE(rp.published_at, rp.created_at) <= ?)
    ORDER BY COALESCE(rp.published_at, rp.created_at) DESC LIMIT 1000`)
    .all(timestamp, userId, bounds.south, bounds.north, bounds.west, bounds.east,
      jobType, `%${jobType}%`, salaryRange, `%${salaryRange}%`, location, `%${location}%`,
      publishedFrom, publishedFrom, publishedTo, publishedTo);
  return aggregateMarketMap(rows, zoom, limit, (row) => ({
    id: row.id, jobType: row.job_type, salaryRange: row.salary_range,
    settlementMethod: row.settlement_method, locationText: row.location_text,
    publishedAt: row.published_at || row.created_at, status: row.status,
  }));
}

export function mapMarketJobSeekingInformation(db, userId, bounds, {
  zoom, limit = 50, jobTypeName = '', expectedSalary = '', workMethod = '', location = '', publishedFrom = null, publishedTo = null,
} = {}) {
  assertMarketViewer(db, userId, 'recruiter');
  const timestamp = now();
  const rows = db.prepare(`SELECT i.role_profile_id, i.job_type_name, i.expected_salary, i.work_method, i.location_text,
      i.latitude, i.longitude, i.visibility_status, i.published_at, i.created_at
    FROM applicant_job_seeking_information i
    JOIN role_profiles role ON role.id = i.role_profile_id AND role.review_status = 'approved'
    WHERE ${publicApplicantPredicate('i')}
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = role.user_id)
      AND i.latitude BETWEEN ? AND ? AND i.longitude BETWEEN ? AND ?
      AND (? = '' OR i.job_type_name LIKE ?)
      AND (? = '' OR i.expected_salary LIKE ?)
      AND (? = '' OR i.work_method = ?)
      AND (? = '' OR i.location_text LIKE ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) >= ?)
      AND (? IS NULL OR COALESCE(i.published_at, i.created_at) <= ?)
    ORDER BY COALESCE(i.published_at, i.created_at) DESC LIMIT 1000`)
    .all(timestamp, userId, bounds.south, bounds.north, bounds.west, bounds.east,
      jobTypeName, `%${jobTypeName}%`, expectedSalary, `%${expectedSalary}%`,
      workMethod, workMethod, location, `%${location}%`,
      publishedFrom, publishedFrom, publishedTo, publishedTo);
  return aggregateMarketMap(rows, zoom, limit, (row) => ({
    id: row.role_profile_id, jobTypeName: row.job_type_name, expectedSalary: row.expected_salary,
    workMethod: row.work_method, locationText: row.location_text,
    publishedAt: row.published_at || row.created_at, status: row.visibility_status,
  }));
}

export function setMarketVisibility(db, userId, type, id, enabled) {
  const timestamp = now();
  if (type === 'applicant_information') {
    const profile = marketRole(db, userId, 'applicant');
    const result = db.prepare(`UPDATE applicant_job_seeking_information
      SET visibility_status = ?, disabled_at = ?, moderation_reason = NULL, moderated_by = NULL,
        moderated_at = NULL, updated_at = ?
      WHERE role_profile_id = ? AND visibility_status = 'published'`)
      .run(enabled ? 'published' : 'disabled', enabled ? null : timestamp, timestamp, profile.id);
    return result.changes > 0;
  }
  const profile = marketRole(db, userId, 'recruiter');
  const result = db.prepare(`UPDATE recruitment_posts
    SET status = ?, disabled_at = ?, moderation_reason = NULL, moderated_by = NULL,
      moderated_at = NULL, updated_at = ?
    WHERE id = ? AND recruiter_role_profile_id = ? AND status = 'published'`)
    .run(enabled ? 'published' : 'disabled', enabled ? null : timestamp, timestamp, id, profile.id);
  return result.changes > 0;
}

export function renewMarketPublication(db, userId, type, id = '') {
  const timestamp = now();
  const expiresAt = defaultExpiresAt(timestamp);
  if (type === 'applicant_information') {
    const profile = marketRole(db, userId, 'applicant');
    const row = db.prepare('SELECT * FROM applicant_job_seeking_information WHERE role_profile_id = ?').get(profile.id);
    if (!row) return null;
    db.prepare(`UPDATE applicant_job_seeking_information
      SET expires_at = ?, visibility_status = CASE WHEN visibility_status = 'disabled' AND moderated_by IS NULL THEN 'published' ELSE visibility_status END,
        disabled_at = CASE WHEN visibility_status = 'disabled' AND moderated_by IS NULL THEN NULL ELSE disabled_at END,
        updated_at = ?
      WHERE role_profile_id = ?`).run(expiresAt, timestamp, profile.id);
    return getApplicantJobSeekingInformation(db, userId);
  }
  const profile = marketRole(db, userId, 'recruiter');
  const row = db.prepare('SELECT * FROM recruitment_posts WHERE id = ? AND recruiter_role_profile_id = ?').get(id, profile.id);
  if (!row) return null;
  db.prepare(`UPDATE recruitment_posts
    SET expires_at = ?,
      status = CASE WHEN status = 'disabled' AND moderated_by IS NULL THEN 'published' ELSE status END,
      disabled_at = CASE WHEN status = 'disabled' AND moderated_by IS NULL THEN NULL ELSE disabled_at END,
      updated_at = ?
    WHERE id = ?`).run(expiresAt, timestamp, id);
  return getRecruitmentPost(db, userId, id);
}

export function setFavorite(db, userId, direction, targetId, enabled) {
  const timestamp = now();
  if (direction === 'recruitment') {
    const profile = assertMarketViewer(db, userId, 'applicant');
    if (!db.prepare(`SELECT post.id FROM recruitment_posts post
      JOIN role_profiles role ON role.id = post.recruiter_role_profile_id AND role.review_status = 'approved'
      WHERE post.id = ? AND ${publicRecruitmentPredicate('post')}`).get(targetId, timestamp)) return false;
    if (enabled) db.prepare('INSERT OR IGNORE INTO applicant_favorites VALUES (?, ?, ?)').run(profile.id, targetId, timestamp);
    else db.prepare('DELETE FROM applicant_favorites WHERE applicant_role_profile_id = ? AND recruitment_post_id = ?').run(profile.id, targetId);
    return true;
  }
  const profile = assertMarketViewer(db, userId, 'recruiter');
  if (!db.prepare(`SELECT information.role_profile_id FROM applicant_job_seeking_information information
    JOIN role_profiles role ON role.id = information.role_profile_id AND role.review_status = 'approved'
    WHERE information.role_profile_id = ? AND ${publicApplicantPredicate('information')}`)
    .get(targetId, timestamp)) return false;
  if (enabled) db.prepare('INSERT OR IGNORE INTO recruiter_favorites VALUES (?, ?, ?)').run(profile.id, targetId, timestamp);
  else db.prepare('DELETE FROM recruiter_favorites WHERE recruiter_role_profile_id = ? AND applicant_information_role_profile_id = ?').run(profile.id, targetId);
  return true;
}

export function listFavorites(db, userId, direction) {
  const timestamp = now();
  if (direction === 'recruitment') {
    const profile = marketRole(db, userId, 'applicant');
    return db.prepare(`SELECT f.recruitment_post_id AS id, f.created_at AS favoritedAt,
        CASE WHEN ${publicRecruitmentPredicate('rp')} THEN 'published' ELSE 'expired' END AS status,
        rp.published_at AS publishedAt, rp.job_type AS jobType, rp.salary_range AS salaryRange
      FROM applicant_favorites f
      JOIN recruitment_posts rp ON rp.id = f.recruitment_post_id
      JOIN role_profiles owner ON owner.id = rp.recruiter_role_profile_id
      WHERE f.applicant_role_profile_id = ?
        AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = owner.user_id)
      ORDER BY f.created_at DESC`).all(timestamp, profile.id, userId);
  }
  const profile = marketRole(db, userId, 'recruiter');
  return db.prepare(`SELECT f.applicant_information_role_profile_id AS id, f.created_at AS favoritedAt,
      CASE WHEN ${publicApplicantPredicate('i')} THEN 'published' ELSE 'expired' END AS status,
      i.published_at AS publishedAt, i.job_type_name AS jobTypeName, i.expected_salary AS expectedSalary
    FROM recruiter_favorites f
    JOIN applicant_job_seeking_information i ON i.role_profile_id = f.applicant_information_role_profile_id
    JOIN role_profiles owner ON owner.id = i.role_profile_id
    WHERE f.recruiter_role_profile_id = ?
      AND NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = owner.user_id)
    ORDER BY f.created_at DESC`).all(timestamp, profile.id, userId);
}

function marketOwner(db, targetType, targetId) {
  if (targetType === 'recruitment_post') {
    return db.prepare(`SELECT role.user_id, role.role FROM recruitment_posts post JOIN role_profiles role ON role.id = post.recruiter_role_profile_id WHERE post.id = ?`).get(targetId);
  }
  return db.prepare(`SELECT role.user_id, role.role FROM role_profiles role WHERE role.id = ? AND role.role = 'applicant'`).get(targetId);
}

export function createMarketUserBlock(db, userId, targetType, targetId) {
  const owner = marketOwner(db, targetType, targetId);
  if (!owner || owner.user_id === userId) return null;
  const id = randomUUID();
  db.prepare('INSERT OR IGNORE INTO market_user_blocks(id, blocker_user_id, blocked_user_id, target_role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, owner.user_id, owner.role, now());
  return listMarketUserBlocks(db, userId).find((item) => item.blockedUserId === owner.user_id) || null;
}

export function listMarketUserBlocks(db, userId) {
  return db.prepare(`SELECT b.id, b.target_role, b.created_at, u.name FROM market_user_blocks b JOIN users u ON u.id = b.blocked_user_id WHERE b.blocker_user_id = ? ORDER BY b.created_at DESC`)
    .all(userId).map((row) => ({ blockId: row.id, role: row.target_role, displayName: row.name, createdAt: row.created_at }));
}

export function deleteMarketUserBlock(db, userId, blockId) {
  return db.prepare('DELETE FROM market_user_blocks WHERE id = ? AND blocker_user_id = ?').run(blockId, userId).changes > 0;
}

export function createMarketReport(db, userId, { targetType, targetId, reason }) {
  assertMarketViewer(db, userId, targetType === 'recruitment_post' ? 'applicant' : 'recruiter');
  const timestamp = now();
  const valid = targetType === 'recruitment_post'
    ? db.prepare(`SELECT post.id FROM recruitment_posts post
      JOIN role_profiles role ON role.id = post.recruiter_role_profile_id AND role.review_status = 'approved'
      WHERE post.id = ? AND ${publicRecruitmentPredicate('post')}`).get(targetId, timestamp)
    : db.prepare(`SELECT information.role_profile_id FROM applicant_job_seeking_information information
      JOIN role_profiles role ON role.id = information.role_profile_id AND role.review_status = 'approved'
      WHERE information.role_profile_id = ? AND ${publicApplicantPredicate('information')}`)
      .get(targetId, timestamp);
  if (!valid) return null;
  const id = randomUUID();
  db.prepare('INSERT INTO market_reports(id, reporter_user_id, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, targetType, targetId, reason, now());
  return marketReportFromRow(db.prepare('SELECT * FROM market_reports WHERE id = ?').get(id));
}

function marketReportFromRow(row) {
  return row ? {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at || null,
  } : null;
}

export function listMarketReports(db, status = null) {
  const rows = status ? db.prepare('SELECT * FROM market_reports WHERE status = ? ORDER BY created_at DESC').all(status) : db.prepare('SELECT * FROM market_reports ORDER BY created_at DESC').all();
  return rows.map(marketReportFromRow);
}

function adminMarketContentFromRow(row) {
  return row ? {
    targetType: row.target_type,
    id: row.id,
    ownerRole: row.owner_role,
    title: row.title,
    subtitle: row.subtitle,
    locationText: row.location_text,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    ...(row.moderation_reason ? { moderationReason: row.moderation_reason } : {}),
    ...(row.moderated_at ? { moderatedAt: row.moderated_at } : {}),
  } : null;
}

function adminMarketContentRow(db, targetType, targetId) {
  if (targetType === 'recruitment_post') {
    return db.prepare(`SELECT 'recruitment_post' AS target_type, post.id, 'recruiter' AS owner_role,
      post.job_type AS title, post.salary_range AS subtitle, post.location_text, post.status,
      COALESCE(post.published_at, post.created_at) AS published_at, post.updated_at,
      post.moderation_reason, post.moderated_at
      FROM recruitment_posts post WHERE post.id = ?`).get(targetId) || null;
  }
  if (targetType === 'applicant_information') {
    return db.prepare(`SELECT 'applicant_information' AS target_type, information.role_profile_id AS id,
      'applicant' AS owner_role, information.job_type_name AS title,
      information.expected_salary AS subtitle, information.location_text,
      information.visibility_status AS status,
      COALESCE(information.published_at, information.created_at) AS published_at,
      information.updated_at, information.moderation_reason, information.moderated_at
      FROM applicant_job_seeking_information information WHERE information.role_profile_id = ?`).get(targetId) || null;
  }
  return null;
}

export function listAdminMarketContent(db, {
  targetType = '', status = '', publishedFrom = null, publishedTo = null, limit = 100,
} = {}) {
  return db.prepare(`SELECT * FROM (
      SELECT 'recruitment_post' AS target_type, post.id, 'recruiter' AS owner_role,
        post.job_type AS title, post.salary_range AS subtitle, post.location_text, post.status,
        COALESCE(post.published_at, post.created_at) AS published_at, post.updated_at,
        post.moderation_reason, post.moderated_at
      FROM recruitment_posts post
      UNION ALL
      SELECT 'applicant_information' AS target_type, information.role_profile_id AS id,
        'applicant' AS owner_role, information.job_type_name AS title,
        information.expected_salary AS subtitle, information.location_text,
        information.visibility_status AS status,
        COALESCE(information.published_at, information.created_at) AS published_at,
        information.updated_at, information.moderation_reason, information.moderated_at
      FROM applicant_job_seeking_information information
    ) content
    WHERE (? = '' OR target_type = ?)
      AND (? = '' OR status = ?)
      AND (? IS NULL OR published_at >= ?)
      AND (? IS NULL OR published_at <= ?)
    ORDER BY published_at DESC, id DESC LIMIT ?`)
    .all(targetType, targetType, status, status, publishedFrom, publishedFrom, publishedTo, publishedTo, limit)
    .map(adminMarketContentFromRow);
}

export function decideMarketContent(db, adminUserId, targetType, targetId, decision, reason = '') {
  const current = adminMarketContentRow(db, targetType, targetId);
  if (!current) return null;
  const transitions = {
    published: { request_changes: 'changes_requested', disable: 'disabled' },
    pending_review: { approve: 'published', request_changes: 'changes_requested', disable: 'disabled' },
    changes_requested: { disable: 'disabled' },
    disabled: { restore: 'published' },
  };
  const nextStatus = transitions[current.status]?.[decision];
  if (!nextStatus) {
    const error = new Error('INVALID_MARKET_TRANSITION');
    error.currentStatus = current.status;
    throw error;
  }
  const timestamp = now();
  const moderationReason = decision === 'request_changes' || decision === 'disable' ? reason || null : null;
  const disabledAt = nextStatus === 'disabled' ? timestamp : null;
  const table = targetType === 'recruitment_post' ? 'recruitment_posts' : 'applicant_job_seeking_information';
  const idColumn = targetType === 'recruitment_post' ? 'id' : 'role_profile_id';
  const statusColumn = targetType === 'recruitment_post' ? 'status' : 'visibility_status';
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE ${table} SET ${statusColumn} = ?, moderation_reason = ?, moderated_by = ?,
      moderated_at = ?, disabled_at = ?, updated_at = ? WHERE ${idColumn} = ?`)
      .run(nextStatus, moderationReason, adminUserId, timestamp, disabledAt, timestamp, targetId);
    recordAdminAudit(db, adminUserId, 'market.content.moderated', targetType, targetId, {
      decision,
      previousStatus: current.status,
      status: nextStatus,
      ...(reason ? { reason } : {}),
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return adminMarketContentFromRow(adminMarketContentRow(db, targetType, targetId));
}

export function resolveMarketReport(db, adminUserId, reportId, decision) {
  const report = db.prepare('SELECT * FROM market_reports WHERE id = ?').get(reportId);
  if (!report) return null;
  const timestamp = now();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE market_reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?').run(decision, adminUserId, timestamp, reportId);
    if (decision === 'resolved') {
      if (report.target_type === 'recruitment_post') {
        db.prepare("UPDATE recruitment_posts SET status = 'disabled', disabled_at = ?, moderation_reason = ?, moderated_by = ?, moderated_at = ?, updated_at = ? WHERE id = ?")
          .run(timestamp, report.reason, adminUserId, timestamp, timestamp, report.target_id);
      } else {
        db.prepare("UPDATE applicant_job_seeking_information SET visibility_status = 'disabled', disabled_at = ?, moderation_reason = ?, moderated_by = ?, moderated_at = ?, updated_at = ? WHERE role_profile_id = ?")
          .run(timestamp, report.reason, adminUserId, timestamp, timestamp, report.target_id);
      }
    }
    recordAdminAudit(db, adminUserId, 'market.report.decided', 'market_report', reportId, {
      decision,
      targetType: report.target_type,
      targetId: report.target_id,
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return listMarketReports(db).find((item) => item.id === reportId);
}

export function recordContactView(db, userId, targetType, targetId) {
  const recent = db.prepare('SELECT COUNT(*) AS count FROM market_contact_views WHERE viewer_user_id = ? AND created_at > ?').get(userId, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent.count >= 30) return false;
  db.prepare('INSERT INTO market_contact_views(id, viewer_user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), userId, targetType, targetId, now());
  return true;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password, encoded) {
  const [algorithm, salt, expectedHex] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function adminAccountFromRow(row) {
  return row ? {
    id: row.user_id,
    loginName: row.login_name,
    status: row.status,
    role: row.role,
    ...(row.last_login_at ? { lastLoginAt: row.last_login_at } : {}),
  } : null;
}

export function recordAdminAudit(db, adminUserId, action, targetType, targetId = null, details = {}) {
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`INSERT INTO admin_audit_logs(
    id, admin_user_id, action, target_type, target_id, details_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, adminUserId, action, targetType, targetId, JSON.stringify(details), createdAt);
  return { id, adminUserId, action, targetType, targetId, details, createdAt };
}

export function listAdminAuditLogs(db, limit = 100) {
  return db.prepare(`SELECT log.*, account.login_name
    FROM admin_audit_logs log JOIN admin_accounts account ON account.user_id = log.admin_user_id
    ORDER BY log.created_at DESC, log.id DESC LIMIT ?`).all(Math.min(Math.max(limit, 1), 200)).map((row) => ({
    id: row.id,
    adminUserId: row.admin_user_id,
    adminLoginName: row.login_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id || null,
    details: JSON.parse(row.details_json),
    createdAt: row.created_at,
  }));
}

export function countActiveOwners(db) {
  return db.prepare(`SELECT COUNT(*) AS count FROM admin_accounts account
    JOIN admin_roles role ON role.user_id = account.user_id
    WHERE account.status = 'active' AND role.role = 'owner'`).get().count;
}

export function findAdminByLogin(db, loginName) {
  return db.prepare(`
    SELECT aa.user_id, aa.login_name, aa.password_hash, aa.status, aa.last_login_at, ar.role
    FROM admin_accounts aa JOIN admin_roles ar ON ar.user_id = aa.user_id
    WHERE aa.login_name = ?
  `).get(loginName) || null;
}

export function findAdminById(db, userId) {
  return db.prepare(`
    SELECT aa.user_id, aa.login_name, aa.password_hash, aa.status, aa.last_login_at, ar.role
    FROM admin_accounts aa JOIN admin_roles ar ON ar.user_id = aa.user_id
    WHERE aa.user_id = ?
  `).get(userId) || null;
}

export function listAdminAccounts(db) {
  return db.prepare(`
    SELECT aa.user_id, aa.login_name, aa.status, aa.last_login_at, ar.role
    FROM admin_accounts aa JOIN admin_roles ar ON ar.user_id = aa.user_id
    ORDER BY aa.created_at ASC
  `).all().map(adminAccountFromRow);
}

export function createAdminAccount(db, { loginName, password, role, createdBy = 'bootstrap' }) {
  const timestamp = now();
  const userId = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO users(id, email, name, status, created_at, updated_at) VALUES (?, NULL, ?, \'active\', ?, ?)' )
      .run(userId, loginName, timestamp, timestamp);
    db.prepare(`INSERT INTO admin_accounts(user_id, login_name, password_hash, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)`)
      .run(userId, loginName, hashPassword(password), createdBy, timestamp, timestamp);
    db.prepare('INSERT INTO admin_roles(user_id, role, assigned_by, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, role, createdBy, timestamp);
    if (createdBy !== 'bootstrap') {
      recordAdminAudit(db, createdBy, 'admin.account.created', 'admin_account', userId, { loginName, role });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return adminAccountFromRow(findAdminById(db, userId));
}

export function bootstrapAdmin(db, { loginName, password }) {
  if (!loginName || !password) return null;
  const existing = db.prepare('SELECT user_id FROM admin_accounts LIMIT 1').get();
  if (existing) return findAdminById(db, existing.user_id);
  return createAdminAccount(db, { loginName, password, role: 'owner' });
}

export function updateAdminLogin(db, userId, { password, status, role }, assignedBy) {
  const current = findAdminById(db, userId);
  if (!current) return null;
  const timestamp = now();
  const changedFields = [];
  db.exec('BEGIN');
  try {
    if (password) {
      db.prepare('UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE user_id = ?').run(hashPassword(password), timestamp, userId);
      changedFields.push('password');
    }
    if (status && status !== current.status) {
      db.prepare('UPDATE admin_accounts SET status = ?, updated_at = ? WHERE user_id = ?').run(status, timestamp, userId);
      changedFields.push('status');
    }
    if (role && role !== current.role) {
      db.prepare('UPDATE admin_roles SET role = ?, assigned_by = ? WHERE user_id = ?').run(role, assignedBy, userId);
      changedFields.push('role');
    }
    if (changedFields.length) {
      db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(timestamp, userId);
      recordAdminAudit(db, assignedBy, 'admin.account.updated', 'admin_account', userId, {
        changedFields,
        previousStatus: current.status,
        status: status || current.status,
        previousRole: current.role,
        role: role || current.role,
      });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return adminAccountFromRow(findAdminById(db, userId));
}

export function touchAdminLogin(db, userId) {
  db.prepare('UPDATE admin_accounts SET last_login_at = ?, updated_at = ? WHERE user_id = ?').run(now(), now(), userId);
}

export function createAdminSession(db, userId, tokenHash, expiresAt, sessionId = randomUUID()) {
  db.prepare('INSERT INTO admin_sessions(id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(sessionId, userId, tokenHash, expiresAt, now());
}

export function findAdminSession(db, tokenHash) {
  return db.prepare(`
    SELECT aa.user_id, aa.login_name, aa.status, aa.last_login_at, ar.role
    FROM admin_sessions s
    JOIN admin_accounts aa ON aa.user_id = s.user_id
    JOIN admin_roles ar ON ar.user_id = aa.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
  `).get(tokenHash, now()) || null;
}

export function revokeAdminSession(db, tokenHash) {
  db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(now(), tokenHash);
}

export function revokeAdminSessionsForUser(db, userId) {
  db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now(), userId);
}

