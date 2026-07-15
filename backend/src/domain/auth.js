import { randomUUID } from 'node:crypto';
import { now } from './time.js';

export function grantReviewer(db, userId) {
  db.prepare(`
    INSERT OR IGNORE INTO reviewer_permissions(user_id, permission, created_at)
    VALUES (?, 'identity_review', ?)
  `).run(userId, now());
}

export function createUserForProvider(db, providerSubject, unionId = null) {
  const timestamp = now();
  const existing = db.prepare(`
    SELECT u.id, u.status
    FROM auth_accounts a JOIN users u ON u.id = a.user_id
    WHERE a.provider = 'wechat' AND a.provider_subject = ?
  `).get(providerSubject);

  if (existing) {
    db.prepare('UPDATE auth_accounts SET last_login_at = ?, union_id = COALESCE(?, union_id) WHERE provider = \'wechat\' AND provider_subject = ?')
      .run(timestamp, unionId, providerSubject);
    return existing;
  }

  const userId = randomUUID();
  const accountId = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO users(id, email, name, status, created_at, updated_at) VALUES (?, NULL, ?, \'active\', ?, ?)')
      .run(userId, '微信用户', timestamp, timestamp);
    db.prepare('INSERT INTO auth_accounts(id, user_id, provider, provider_subject, union_id, created_at, last_login_at) VALUES (?, ?, \'wechat\', ?, ?, ?, ?)')
      .run(accountId, userId, providerSubject, unionId, timestamp, timestamp);
    db.exec('COMMIT');
    return { id: userId, status: 'active' };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function createSession(db, userId, tokenHash, expiresAt, sessionId = randomUUID()) {
  db.prepare(`
    INSERT INTO sessions(id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, userId, tokenHash, expiresAt, now());
}

export function findSessionUser(db, tokenHash) {
  return db.prepare(`
    SELECT u.id, u.status
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
  `).get(tokenHash, now()) || null;
}
