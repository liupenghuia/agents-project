import { randomUUID } from 'node:crypto';
import { now } from '../time.js';
import { recordAdminAudit } from '../admin.js';
import { listMarketReports } from './reports.js';

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
