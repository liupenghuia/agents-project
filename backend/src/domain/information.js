import { randomUUID, randomBytes } from 'node:crypto';
import { now, defaultExpiresAt, isPublicationActive } from './time.js';
import { roleProfileForUser } from './identity.js';

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
