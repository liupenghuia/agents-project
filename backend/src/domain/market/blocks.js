import { randomUUID } from 'node:crypto';
import { now } from '../time.js';

function marketOwner(db, targetType, targetId) {
  if (targetType === 'recruitment_post') {
    return db.prepare(`SELECT role.user_id, role.role FROM recruitment_posts post JOIN role_profiles role ON role.id = post.recruiter_role_profile_id WHERE post.id = ?`).get(targetId);
  }
  return db.prepare(`SELECT role.user_id, role.role FROM role_profiles role WHERE role.id = ? AND role.role = 'applicant'`).get(targetId);
}

function mapMarketUserBlock(row) {
  if (!row) return null;
  return {
    blockId: row.id,
    role: row.target_role,
    displayName: row.name,
    createdAt: row.created_at,
  };
}

export function createMarketUserBlock(db, userId, targetType, targetId) {
  const owner = marketOwner(db, targetType, targetId);
  if (!owner || owner.user_id === userId) return null;
  const existing = db.prepare(`SELECT b.id, b.target_role, b.created_at, u.name
    FROM market_user_blocks b
    JOIN users u ON u.id = b.blocked_user_id
    WHERE b.blocker_user_id = ? AND b.blocked_user_id = ?`).get(userId, owner.user_id);
  if (existing) return mapMarketUserBlock(existing);

  const id = randomUUID();
  const createdAt = now();
  db.prepare('INSERT INTO market_user_blocks(id, blocker_user_id, blocked_user_id, target_role, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, owner.user_id, owner.role, createdAt);
  const name = db.prepare('SELECT name FROM users WHERE id = ?').get(owner.user_id)?.name || '用户';
  return mapMarketUserBlock({
    id,
    target_role: owner.role,
    created_at: createdAt,
    name,
  });
}

export function listMarketUserBlocks(db, userId) {
  return db.prepare(`SELECT b.id, b.target_role, b.created_at, u.name FROM market_user_blocks b JOIN users u ON u.id = b.blocked_user_id WHERE b.blocker_user_id = ? ORDER BY b.created_at DESC`)
    .all(userId).map(mapMarketUserBlock);
}

export function deleteMarketUserBlock(db, userId, blockId) {
  return db.prepare('DELETE FROM market_user_blocks WHERE id = ? AND blocker_user_id = ?').run(blockId, userId).changes > 0;
}
