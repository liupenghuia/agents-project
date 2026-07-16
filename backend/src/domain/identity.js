import { randomBytes } from 'node:crypto';
import { httpError, normalizedPhone } from '../http.js';
import { assertIdentityReviewDecision } from './validators.js';
import { recordAdminAudit } from './admin.js';
import { now } from './time.js';

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

export { roleProfileForUser };

const IDENTITY_DETAIL_SELECT = `
  SELECT rp.*, r.organization_name, r.organization_type, r.contact_name, r.contact_phone,
    r.region AS recruiter_region, r.industry_or_job_direction,
    a.display_name, a.contact_phone AS applicant_phone, a.region AS applicant_region,
    a.desired_job, a.experience_summary, a.preferred_region_or_time
  FROM role_profiles rp
  LEFT JOIN recruiter_profiles r ON r.role_profile_id = rp.id
  LEFT JOIN applicant_profiles a ON a.role_profile_id = rp.id
`;

export function profileFromRow(row) {
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

export function identityFromRow(row) {
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

export function summaryFromRow(row) {
  return {
    id: row.id,
    role: row.role,
    reviewStatus: row.review_status,
    ...(row.review_reason ? { reviewReason: row.review_reason } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function identityRow(db, identityId) {
  return db.prepare(`${IDENTITY_DETAIL_SELECT} WHERE rp.id = ?`).get(identityId) || null;
}

export function normalizeRow(row) {
  if (!row) return row;
  if (row.role === 'recruiter') {
    row.region = row.recruiter_region;
  } else {
    row.region = row.applicant_region;
    row.contact_phone = row.applicant_phone;
  }
  return row;
}

export function listIdentityRows(db, userId, status = null) {
  const filter = status ? ' AND rp.review_status = ?' : '';
  const params = status ? [userId, status] : [userId];
  return db.prepare(`
    ${IDENTITY_DETAIL_SELECT}
    WHERE rp.user_id = ?${filter}
    ORDER BY rp.created_at ASC
  `).all(...params).map(normalizeRow);
}

export function reviewRows(db, status) {
  const condition = status
    ? 'WHERE rp.review_status = ?'
    : "WHERE rp.review_status IN ('pending_review', 'changes_requested')";
  return db.prepare(`
    ${IDENTITY_DETAIL_SELECT}
    ${condition}
    ORDER BY rp.submitted_at ASC
  `).all(...(status ? [status] : [])).map(normalizeRow);
}

function findPhoneOwner(db, phone, { excludeIdentityId = null } = {}) {
  if (excludeIdentityId) {
    return db.prepare(`
      SELECT rp.user_id, rp.id, rp.role
      FROM role_profiles rp
      LEFT JOIN recruiter_profiles r ON r.role_profile_id = rp.id
      LEFT JOIN applicant_profiles a ON a.role_profile_id = rp.id
      WHERE REPLACE(REPLACE(COALESCE(r.contact_phone, a.contact_phone), ' ', ''), '-', '') = ?
        AND rp.id <> ?
      LIMIT 1
    `).get(phone, excludeIdentityId) || null;
  }
  return db.prepare(`
    SELECT rp.user_id, rp.role
    FROM role_profiles rp
    LEFT JOIN recruiter_profiles r ON r.role_profile_id = rp.id
    LEFT JOIN applicant_profiles a ON a.role_profile_id = rp.id
    WHERE REPLACE(REPLACE(COALESCE(r.contact_phone, a.contact_phone), ' ', ''), '-', '') = ?
    LIMIT 1
  `).get(phone) || null;
}

export function createIdentity(db, userId, role, profile) {
  const existing = db.prepare('SELECT id FROM role_profiles WHERE user_id = ? AND role = ?').get(userId, role);
  if (existing) throw httpError(409, 'IDENTITY_EXISTS', '该身份已经创建');
  const phone = normalizedPhone(profile.contactPhone);
  const phoneOwner = findPhoneOwner(db, phone);
  if (phoneOwner) {
    if (phoneOwner.user_id === userId && phoneOwner.role === role) {
      throw httpError(409, 'IDENTITY_EXISTS', '该身份已经创建');
    }
    throw httpError(409, 'PHONE_ROLE_BOUND', '该手机号已绑定其他角色，不能重复注册或切换角色');
  }
  const timestamp = now();
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
      `).run(
        identityId,
        profile.organizationName,
        profile.organizationType,
        profile.contactName,
        profile.contactPhone,
        profile.region,
        profile.industryOrJobDirection,
        timestamp,
        timestamp,
      );
    } else {
      db.prepare(`
        INSERT INTO applicant_profiles(role_profile_id, display_name, contact_phone, region, desired_job,
          experience_summary, preferred_region_or_time, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        identityId,
        profile.displayName,
        profile.contactPhone,
        profile.region,
        profile.desiredJob,
        profile.experienceSummary,
        profile.preferredRegionOrTime,
        timestamp,
        timestamp,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return identityFromRow(normalizeRow(identityRow(db, identityId)));
}

export function updateIdentityForResubmit(db, userId, identityId, profile) {
  const row = normalizeRow(identityRow(db, identityId));
  if (!row || row.user_id !== userId) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
  if (row.review_status !== 'changes_requested') {
    throw httpError(409, 'INVALID_IDENTITY_STATE', '当前身份不允许重新提交');
  }
  const phone = normalizedPhone(profile.contactPhone);
  const phoneOwner = findPhoneOwner(db, phone, { excludeIdentityId: identityId });
  if (phoneOwner) throw httpError(409, 'PHONE_ROLE_BOUND', '该手机号已绑定其他角色，不能更换为该手机号');
  const timestamp = now();
  db.exec('BEGIN');
  try {
    if (row.role === 'recruiter') {
      db.prepare(`UPDATE recruiter_profiles SET organization_name = ?, organization_type = ?, contact_name = ?,
        contact_phone = ?, region = ?, industry_or_job_direction = ?, updated_at = ? WHERE role_profile_id = ?`)
        .run(
          profile.organizationName,
          profile.organizationType,
          profile.contactName,
          profile.contactPhone,
          profile.region,
          profile.industryOrJobDirection,
          timestamp,
          identityId,
        );
    } else {
      db.prepare(`UPDATE applicant_profiles SET display_name = ?, contact_phone = ?, region = ?, desired_job = ?,
        experience_summary = ?, preferred_region_or_time = ?, updated_at = ? WHERE role_profile_id = ?`)
        .run(
          profile.displayName,
          profile.contactPhone,
          profile.region,
          profile.desiredJob,
          profile.experienceSummary,
          profile.preferredRegionOrTime,
          timestamp,
          identityId,
        );
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

export function decideReview(db, reviewerId, identityId, decision, reason) {
  const validated = assertIdentityReviewDecision(decision, reason);
  const row = identityRow(db, identityId);
  if (!row) throw httpError(404, 'IDENTITY_NOT_FOUND', '身份不存在');
  if (!['pending_review', 'changes_requested'].includes(row.review_status)) {
    throw httpError(409, 'INVALID_IDENTITY_STATE', '当前身份不在待审核状态');
  }
  const timestamp = now();
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE role_profiles SET review_status = ?, review_reason = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
      .run(
        validated.decision,
        validated.decision === 'changes_requested' ? validated.reason : null,
        timestamp,
        timestamp,
        identityId,
      );
    const reviewColumns = db.prepare('PRAGMA table_info(review_actions)').all().map((column) => column.name);
    if (reviewColumns.includes('reviewer_user_id')) {
      db.prepare(`INSERT INTO review_actions(id, role_profile_id, admin_user_id, reviewer_user_id, decision, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(
          randomBytes(16).toString('hex'),
          identityId,
          reviewerId,
          reviewerId,
          validated.decision,
          validated.reason,
          timestamp,
        );
    } else {
      db.prepare(`INSERT INTO review_actions(id, role_profile_id, admin_user_id, decision, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(
          randomBytes(16).toString('hex'),
          identityId,
          reviewerId,
          validated.decision,
          validated.reason,
          timestamp,
        );
    }
    recordAdminAudit(db, reviewerId, 'identity.review.decided', 'role_profile', identityId, {
      decision: validated.decision,
      ...(validated.reason ? { reason: validated.reason } : {}),
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return identityFromRow(normalizeRow(identityRow(db, identityId)));
}
