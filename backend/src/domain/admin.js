import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { now } from './time.js';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password, encoded) {
  const [algorithm, salt, expectedHex] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function adminAccountFromRow(row) {
  return row ? {
    id: row.user_id,
    loginName: row.login_name,
    status: row.status,
    role: row.role,
    ...(row.last_login_at ? { lastLoginAt: row.last_login_at } : {}),
  } : null;
}

export function recordAdminAudit(db, adminUserId, action, targetType, targetId = null, details = {}) {
  const id = randomUUID();
  const createdAt = now();
  db.prepare(`INSERT INTO admin_audit_logs(
    id, admin_user_id, action, target_type, target_id, details_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, adminUserId, action, targetType, targetId, JSON.stringify(details), createdAt);
  return { id, adminUserId, action, targetType, targetId, details, createdAt };
}

export function listAdminAuditLogs(db, limit = 100) {
  return db.prepare(`SELECT log.*, account.login_name
    FROM admin_audit_logs log JOIN admin_accounts account ON account.user_id = log.admin_user_id
    ORDER BY log.created_at DESC, log.id DESC LIMIT ?`).all(Math.min(Math.max(limit, 1), 200)).map((row) => ({
    id: row.id,
    adminUserId: row.admin_user_id,
    adminLoginName: row.login_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id || null,
    details: JSON.parse(row.details_json),
    createdAt: row.created_at,
  }));
}

export function countActiveOwners(db) {
  return db.prepare(`SELECT COUNT(*) AS count FROM admin_accounts account
    JOIN admin_roles role ON role.user_id = account.user_id
    WHERE account.status = 'active' AND role.role = 'owner'`).get().count;
}

export function findAdminByLogin(db, loginName) {
  return db.prepare(`
    SELECT aa.user_id, aa.login_name, aa.password_hash, aa.status, aa.last_login_at, ar.role
    FROM admin_accounts aa JOIN admin_roles ar ON ar.user_id = aa.user_id
    WHERE aa.login_name = ?
  `).get(loginName) || null;
}

export function findAdminById(db, userId) {
  return db.prepare(`
    SELECT aa.user_id, aa.login_name, aa.password_hash, aa.status, aa.last_login_at, ar.role
    FROM admin_accounts aa JOIN admin_roles ar ON ar.user_id = aa.user_id
    WHERE aa.user_id = ?
  `).get(userId) || null;
}

export function listAdminAccounts(db) {
  return db.prepare(`
    SELECT aa.user_id, aa.login_name, aa.status, aa.last_login_at, ar.role
    FROM admin_accounts aa JOIN admin_roles ar ON ar.user_id = aa.user_id
    ORDER BY aa.created_at ASC
  `).all().map(adminAccountFromRow);
}

export function createAdminAccount(db, { loginName, password, role, createdBy = 'bootstrap' }) {
  const timestamp = now();
  const userId = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO users(id, email, name, status, created_at, updated_at) VALUES (?, NULL, ?, \'active\', ?, ?)' )
      .run(userId, loginName, timestamp, timestamp);
    db.prepare(`INSERT INTO admin_accounts(user_id, login_name, password_hash, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)`)
      .run(userId, loginName, hashPassword(password), createdBy, timestamp, timestamp);
    db.prepare('INSERT INTO admin_roles(user_id, role, assigned_by, created_at) VALUES (?, ?, ?, ?)')
      .run(userId, role, createdBy, timestamp);
    if (createdBy !== 'bootstrap') {
      recordAdminAudit(db, createdBy, 'admin.account.created', 'admin_account', userId, { loginName, role });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return adminAccountFromRow(findAdminById(db, userId));
}

export function bootstrapAdmin(db, { loginName, password }) {
  if (!loginName || !password) return null;
  const existing = db.prepare('SELECT user_id FROM admin_accounts LIMIT 1').get();
  if (existing) return findAdminById(db, existing.user_id);
  return createAdminAccount(db, { loginName, password, role: 'owner' });
}

export function updateAdminLogin(db, userId, { password, status, role }, assignedBy) {
  const current = findAdminById(db, userId);
  if (!current) return null;
  const timestamp = now();
  const changedFields = [];
  db.exec('BEGIN');
  try {
    if (password) {
      db.prepare('UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE user_id = ?').run(hashPassword(password), timestamp, userId);
      changedFields.push('password');
    }
    if (status && status !== current.status) {
      db.prepare('UPDATE admin_accounts SET status = ?, updated_at = ? WHERE user_id = ?').run(status, timestamp, userId);
      changedFields.push('status');
    }
    if (role && role !== current.role) {
      db.prepare('UPDATE admin_roles SET role = ?, assigned_by = ? WHERE user_id = ?').run(role, assignedBy, userId);
      changedFields.push('role');
    }
    if (changedFields.length) {
      db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(timestamp, userId);
      recordAdminAudit(db, assignedBy, 'admin.account.updated', 'admin_account', userId, {
        changedFields,
        previousStatus: current.status,
        status: status || current.status,
        previousRole: current.role,
        role: role || current.role,
      });
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return adminAccountFromRow(findAdminById(db, userId));
}

export function touchAdminLogin(db, userId) {
  db.prepare('UPDATE admin_accounts SET last_login_at = ?, updated_at = ? WHERE user_id = ?').run(now(), now(), userId);
}

export function createAdminSession(db, userId, tokenHash, expiresAt, sessionId = randomUUID()) {
  db.prepare('INSERT INTO admin_sessions(id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(sessionId, userId, tokenHash, expiresAt, now());
}

export function findAdminSession(db, tokenHash) {
  return db.prepare(`
    SELECT aa.user_id, aa.login_name, aa.status, aa.last_login_at, ar.role
    FROM admin_sessions s
    JOIN admin_accounts aa ON aa.user_id = s.user_id
    JOIN admin_roles ar ON ar.user_id = aa.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
  `).get(tokenHash, now()) || null;
}

export function revokeAdminSession(db, tokenHash) {
  db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(now(), tokenHash);
}

export function revokeAdminSessionsForUser(db, userId) {
  db.prepare('UPDATE admin_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now(), userId);
}


