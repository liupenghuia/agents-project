import { roleProfileForUser } from '../identity.js';

export function marketRole(db, userId, role) {
  return roleProfileForUser(db, userId, role);
}

export function approvedCounterpart(db, userId, role) {
  return db.prepare("SELECT id FROM role_profiles WHERE user_id = ? AND role = ? AND review_status = 'approved'").get(userId, role) || null;
}

export function assertMarketViewer(db, userId, targetRole) {
  const profile = approvedCounterpart(db, userId, targetRole);
  if (!profile) throw new Error('COUNTERPART_IDENTITY_REQUIRED');
  return profile;
}
