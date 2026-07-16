import { randomUUID } from 'node:crypto';
import { now } from '../time.js';
import { publicApplicantPredicate, publicRecruitmentPredicate } from '../visibility.js';
import { assertMarketViewer } from './access.js';

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

export function listMarketReports(db, status = null) {
  const rows = status ? db.prepare('SELECT * FROM market_reports WHERE status = ? ORDER BY created_at DESC').all(status) : db.prepare('SELECT * FROM market_reports ORDER BY created_at DESC').all();
  return rows.map(marketReportFromRow);
}

export { marketReportFromRow };
