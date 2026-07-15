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
