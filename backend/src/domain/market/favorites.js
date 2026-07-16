import { now } from '../time.js';
import { publicApplicantPredicate, publicRecruitmentPredicate } from '../visibility.js';
import { assertMarketViewer, marketRole } from './access.js';

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
