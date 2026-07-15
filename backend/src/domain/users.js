import { randomUUID } from 'node:crypto';
import { now } from './time.js';

function publicUser(row) {
  return row ? { id: row.id, email: row.email, name: row.name, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

export function listUsers(db) {
  return db.prepare(`SELECT u.id, u.email, u.name, u.status, u.created_at, u.updated_at
    FROM users u LEFT JOIN admin_accounts aa ON aa.user_id = u.id
    WHERE aa.user_id IS NULL ORDER BY u.created_at DESC`).all().map(publicUser);
}

export function getUser(db, userId) {
  return publicUser(db.prepare(`SELECT u.id, u.email, u.name, u.status, u.created_at, u.updated_at
    FROM users u LEFT JOIN admin_accounts aa ON aa.user_id = u.id
    WHERE u.id = ? AND aa.user_id IS NULL`).get(userId));
}

export function createManagedUser(db, { email, name }) {
  const timestamp = now();
  const id = randomUUID();
  db.prepare('INSERT INTO users(id, email, name, status, created_at, updated_at) VALUES (?, ?, ?, \'active\', ?, ?)')
    .run(id, email, name, timestamp, timestamp);
  return getUser(db, id);
}

export function updateManagedUser(db, userId, { email, name, status }) {
  const current = getUser(db, userId);
  if (!current) return null;
  const timestamp = now();
  db.prepare('UPDATE users SET email = COALESCE(?, email), name = COALESCE(?, name), status = COALESCE(?, status), updated_at = ? WHERE id = ?')
    .run(email ?? null, name ?? null, status ?? null, timestamp, userId);
  if (status === 'disabled') {
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(timestamp, userId);
  }
  return getUser(db, userId);
}

export function disableUser(db, userId) {
  return updateManagedUser(db, userId, { status: 'disabled' });
}
