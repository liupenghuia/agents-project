import { now, isPublicationActive, notExpiredSql } from './time.js';

export { now, isPublicationActive, notExpiredSql };

export function blockedOwnerPredicate(ownerUserExpr) {
  return `NOT EXISTS (SELECT 1 FROM market_user_blocks b WHERE b.blocker_user_id = ? AND b.blocked_user_id = ${ownerUserExpr})`;
}

export function isBlockedEitherWay(db, userA, userB) {
  return Boolean(db.prepare(`SELECT 1 FROM market_user_blocks
    WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?)`)
    .get(userA, userB, userB, userA));
}

export function isPubliclyActionablePublication(owner, timestamp = now()) {
  if (!owner) return false;
  if (owner.status !== 'published') return false;
  return isPublicationActive(owner.expiresAt ?? owner.expires_at, timestamp);
}

export function publicRecruitmentPredicate(alias = 'rp') {
  return `${alias}.status = 'published' AND ${notExpiredSql(alias)}`;
}

export function publicApplicantPredicate(alias = 'i') {
  return `${alias}.visibility_status = 'published' AND ${notExpiredSql(alias)}`;
}
