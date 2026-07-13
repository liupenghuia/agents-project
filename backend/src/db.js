import { randomUUID } from 'node:crypto';
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
    CREATE TABLE IF NOT EXISTS review_actions (
      id TEXT PRIMARY KEY,
      role_profile_id TEXT NOT NULL REFERENCES role_profiles(id),
      reviewer_user_id TEXT NOT NULL REFERENCES users(id),
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
    CREATE INDEX IF NOT EXISTS review_queue_idx ON role_profiles(review_status, submitted_at);
    CREATE INDEX IF NOT EXISTS review_history_idx ON review_actions(role_profile_id, created_at);
  `);
  return db;
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
