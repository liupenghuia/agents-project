import { randomUUID } from 'node:crypto';
import { now, defaultExpiresAt, isPublicationActive, notExpiredSql } from './time.js';
import { publicApplicantPredicate, publicRecruitmentPredicate } from './visibility.js';
import { roleProfileForUser } from './identity.js';
import { getApplicantJobSeekingInformation, getRecruitmentPost } from './information.js';
import { recordAdminAudit } from './admin.js';

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
