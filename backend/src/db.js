import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const now = () => new Date().toISOString();

export function createDatabase(path = process.env.DATABASE_PATH || ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL CHECK (provider = 'wechat'),
      provider_subject TEXT NOT NULL,
      union_id TEXT,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL,
      UNIQUE(provider, provider_subject)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS role_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK (role IN ('recruiter', 'applicant')),
      review_status TEXT NOT NULL CHECK (review_status IN ('pending_review', 'approved', 'changes_requested')),
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT,
      review_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, role)
    );
    CREATE TABLE IF NOT EXISTS recruiter_profiles (
      role_profile_id TEXT PRIMARY KEY REFERENCES role_profiles(id) ON DELETE CASCADE,
      organization_name TEXT NOT NULL,
      organization_type TEXT NOT NULL CHECK (organization_type IN ('company', 'individual', 'other')),
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      region TEXT NOT NULL,
      industry_or_job_direction TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applicant_profiles (
      role_profile_id TEXT PRIMARY KEY REFERENCES role_profiles(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      region TEXT NOT NULL,
      desired_job TEXT NOT NULL,
      experience_summary TEXT NOT NULL,
      preferred_region_or_time TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_accounts (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      login_name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      last_login_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_roles (
      user_id TEXT PRIMARY KEY REFERENCES admin_accounts(user_id),
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'reviewer', 'operator')),
      assigned_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES admin_accounts(user_id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS review_actions (
      id TEXT PRIMARY KEY,
      role_profile_id TEXT NOT NULL REFERENCES role_profiles(id),
      admin_user_id TEXT NOT NULL REFERENCES admin_accounts(user_id),
      decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
      reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviewer_permissions (
      user_id TEXT NOT NULL REFERENCES users(id),
      permission TEXT NOT NULL CHECK (permission = 'identity_review'),
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, permission)
    );
    CREATE INDEX IF NOT EXISTS sessions_user_expiry_idx ON sessions(user_id, expires_at);
    CREATE INDEX IF NOT EXISTS admin_accounts_status_idx ON admin_accounts(status, created_at);
    CREATE INDEX IF NOT EXISTS admin_sessions_user_expiry_idx ON admin_sessions(user_id, expires_at);
    CREATE INDEX IF NOT EXISTS review_queue_idx ON role_profiles(review_status, submitted_at);
    CREATE INDEX IF NOT EXISTS review_history_idx ON review_actions(role_profile_id, created_at);
  `);
  migrateReviewActions(db);
  return db;
}

function migrateReviewActions(db) {
  const columns = db.prepare('PRAGMA table_info(review_actions)').all().map((column) => column.name);
  if (columns.includes('reviewer_user_id') && !columns.includes('admin_user_id')) {
    // Preserve historical WeChat-review records while moving new decisions to admin sessions.
    db.exec('ALTER TABLE review_actions ADD COLUMN admin_user_id TEXT REFERENCES admin_accounts(user_id)');
  }
}

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

export function updateAdminLogin(db, userId, { password, status, role }) {
  const current = findAdminById(db, userId);
  if (!current) return null;
  const timestamp = now();
  if (password) db.prepare('UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE user_id = ?').run(hashPassword(password), timestamp, userId);
  if (status) db.prepare('UPDATE admin_accounts SET status = ?, updated_at = ? WHERE user_id = ?').run(status, timestamp, userId);
  if (role) db.prepare('UPDATE admin_roles SET role = ?, assigned_by = ? WHERE user_id = ?').run(role, 'admin', userId);
  return findAdminById(db, userId) && adminAccountFromRow(findAdminById(db, userId));
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
