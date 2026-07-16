import { now, defaultExpiresAt } from '../time.js';
import { getApplicantJobSeekingInformation, getRecruitmentPost } from '../information.js';
import { marketRole } from './access.js';

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
