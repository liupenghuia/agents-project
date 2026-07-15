import { DatabaseSync } from 'node:sqlite';
import { ensureCollaborationSchema } from './collaboration.js';

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
    CREATE TABLE IF NOT EXISTS applicant_job_seeking_information (
      role_profile_id TEXT PRIMARY KEY REFERENCES role_profiles(id) ON DELETE CASCADE,
      job_type_name TEXT NOT NULL,
      age INTEGER NOT NULL,
      expected_salary TEXT NOT NULL,
      work_method TEXT NOT NULL CHECK (work_method IN ('monthly_settlement', 'indefinite_duration')),
      location_text TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      preferred_work_scope TEXT,
      visibility_status TEXT NOT NULL DEFAULT 'published' CHECK (visibility_status IN ('published', 'pending_review', 'changes_requested', 'disabled')),
      published_at TEXT,
      disabled_at TEXT,
      moderation_reason TEXT,
      moderated_by TEXT REFERENCES admin_accounts(user_id),
      moderated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recruiter_information (
      role_profile_id TEXT PRIMARY KEY REFERENCES role_profiles(id) ON DELETE CASCADE,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      detailed_address TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recruitment_posts (
      id TEXT PRIMARY KEY,
      recruiter_role_profile_id TEXT NOT NULL REFERENCES role_profiles(id) ON DELETE CASCADE,
      job_type TEXT NOT NULL,
      salary_range TEXT NOT NULL,
      settlement_method TEXT NOT NULL,
      location_text TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('published', 'pending_review', 'changes_requested', 'disabled')),
      published_at TEXT,
      disabled_at TEXT,
      moderation_reason TEXT,
      moderated_by TEXT REFERENCES admin_accounts(user_id),
      moderated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media_uploads (
      object_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      content_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      completed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recruitment_post_images (
      id TEXT PRIMARY KEY,
      recruitment_post_id TEXT NOT NULL REFERENCES recruitment_posts(id) ON DELETE CASCADE,
      object_key TEXT NOT NULL REFERENCES media_uploads(object_key),
      content_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(recruitment_post_id, sort_order),
      UNIQUE(recruitment_post_id, object_key)
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
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL REFERENCES admin_accounts(user_id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
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
    CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs(created_at, id);
    CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx ON admin_audit_logs(admin_user_id, created_at);
    CREATE INDEX IF NOT EXISTS review_queue_idx ON role_profiles(review_status, submitted_at);
    CREATE INDEX IF NOT EXISTS review_history_idx ON review_actions(role_profile_id, created_at);
    CREATE INDEX IF NOT EXISTS recruitment_posts_owner_idx ON recruitment_posts(recruiter_role_profile_id, status, created_at);
    CREATE INDEX IF NOT EXISTS recruitment_post_images_idx ON recruitment_post_images(recruitment_post_id, sort_order);
    CREATE INDEX IF NOT EXISTS media_uploads_user_expiry_idx ON media_uploads(user_id, expires_at);
    CREATE TABLE IF NOT EXISTS applicant_favorites (
      applicant_role_profile_id TEXT NOT NULL REFERENCES role_profiles(id) ON DELETE CASCADE,
      recruitment_post_id TEXT NOT NULL REFERENCES recruitment_posts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(applicant_role_profile_id, recruitment_post_id)
    );
    CREATE TABLE IF NOT EXISTS recruiter_favorites (
      recruiter_role_profile_id TEXT NOT NULL REFERENCES role_profiles(id) ON DELETE CASCADE,
      applicant_information_role_profile_id TEXT NOT NULL REFERENCES role_profiles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY(recruiter_role_profile_id, applicant_information_role_profile_id)
    );
    CREATE TABLE IF NOT EXISTS market_contact_views (
      id TEXT PRIMARY KEY,
      viewer_user_id TEXT NOT NULL REFERENCES users(id),
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS market_reports (
      id TEXT PRIMARY KEY,
      reporter_user_id TEXT NOT NULL REFERENCES users(id),
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
      resolved_by TEXT REFERENCES users(id),
      resolved_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS market_user_blocks (
      id TEXT PRIMARY KEY,
      blocker_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_role TEXT NOT NULL CHECK (target_role IN ('recruiter', 'applicant')),
      created_at TEXT NOT NULL,
      UNIQUE(blocker_user_id, blocked_user_id)
    );
    CREATE INDEX IF NOT EXISTS applicant_favorites_created_idx ON applicant_favorites(applicant_role_profile_id, created_at);
    CREATE INDEX IF NOT EXISTS recruiter_favorites_created_idx ON recruiter_favorites(recruiter_role_profile_id, created_at);
    CREATE INDEX IF NOT EXISTS market_contact_views_idx ON market_contact_views(viewer_user_id, target_type, target_id, created_at);
    CREATE INDEX IF NOT EXISTS market_reports_status_idx ON market_reports(status, created_at);
    CREATE INDEX IF NOT EXISTS market_user_blocks_blocker_idx ON market_user_blocks(blocker_user_id, created_at);
    CREATE INDEX IF NOT EXISTS market_user_blocks_blocked_idx ON market_user_blocks(blocked_user_id);
  `);
  migrateMarketColumns(db);
  migrateMarketStatusConstraints(db);
  createMarketIndexes(db);
  migrateReviewActions(db);
  ensureCollaborationSchema(db);
  return db;
}

function migrateMarketColumns(db) {
  const addColumn = (table, column, definition) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
    if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn('applicant_job_seeking_information', 'visibility_status', "TEXT NOT NULL DEFAULT 'published'");
  addColumn('applicant_job_seeking_information', 'published_at', 'TEXT');
  addColumn('applicant_job_seeking_information', 'disabled_at', 'TEXT');
  addColumn('applicant_job_seeking_information', 'moderation_reason', 'TEXT');
  addColumn('applicant_job_seeking_information', 'moderated_by', 'TEXT REFERENCES admin_accounts(user_id)');
  addColumn('applicant_job_seeking_information', 'moderated_at', 'TEXT');
  addColumn('recruitment_posts', 'published_at', 'TEXT');
  addColumn('recruitment_posts', 'disabled_at', 'TEXT');
  addColumn('recruitment_posts', 'moderation_reason', 'TEXT');
  addColumn('recruitment_posts', 'moderated_by', 'TEXT REFERENCES admin_accounts(user_id)');
  addColumn('recruitment_posts', 'moderated_at', 'TEXT');
  addColumn('applicant_job_seeking_information', 'expires_at', 'TEXT');
  addColumn('recruitment_posts', 'expires_at', 'TEXT');
  db.exec('UPDATE applicant_job_seeking_information SET published_at = COALESCE(published_at, created_at) WHERE published_at IS NULL');
  db.exec('UPDATE recruitment_posts SET published_at = COALESCE(published_at, created_at) WHERE published_at IS NULL');
  db.exec(`UPDATE applicant_job_seeking_information SET expires_at = datetime(COALESCE(published_at, created_at), '+30 days') WHERE expires_at IS NULL`);
  db.exec(`UPDATE recruitment_posts SET expires_at = datetime(COALESCE(published_at, created_at), '+30 days') WHERE expires_at IS NULL`);
}

function migrateMarketStatusConstraints(db) {
  const tableSql = (table) => db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)?.sql || '';
  const applicantNeedsRebuild = !tableSql('applicant_job_seeking_information').includes("'pending_review'");
  const postsNeedRebuild = !tableSql('recruitment_posts').includes("'pending_review'");
  if (!applicantNeedsRebuild && !postsNeedRebuild) return;

  db.exec('PRAGMA foreign_keys = OFF; BEGIN');
  try {
    if (applicantNeedsRebuild) {
      db.exec(`
        CREATE TABLE applicant_job_seeking_information_new (
          role_profile_id TEXT PRIMARY KEY REFERENCES role_profiles(id) ON DELETE CASCADE,
          job_type_name TEXT NOT NULL,
          age INTEGER NOT NULL,
          expected_salary TEXT NOT NULL,
          work_method TEXT NOT NULL CHECK (work_method IN ('monthly_settlement', 'indefinite_duration')),
          location_text TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          preferred_work_scope TEXT,
          visibility_status TEXT NOT NULL DEFAULT 'published' CHECK (visibility_status IN ('published', 'pending_review', 'changes_requested', 'disabled')),
          published_at TEXT,
          disabled_at TEXT,
          moderation_reason TEXT,
          moderated_by TEXT REFERENCES admin_accounts(user_id),
          moderated_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO applicant_job_seeking_information_new
          SELECT role_profile_id, job_type_name, age, expected_salary, work_method, location_text,
            latitude, longitude, preferred_work_scope, visibility_status, published_at, disabled_at,
            moderation_reason, moderated_by, moderated_at, created_at, updated_at
          FROM applicant_job_seeking_information;
        DROP TABLE applicant_job_seeking_information;
        ALTER TABLE applicant_job_seeking_information_new RENAME TO applicant_job_seeking_information;
      `);
    }
    if (postsNeedRebuild) {
      db.exec(`
        CREATE TABLE recruitment_posts_new (
          id TEXT PRIMARY KEY,
          recruiter_role_profile_id TEXT NOT NULL REFERENCES role_profiles(id) ON DELETE CASCADE,
          job_type TEXT NOT NULL,
          salary_range TEXT NOT NULL,
          settlement_method TEXT NOT NULL,
          location_text TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('published', 'pending_review', 'changes_requested', 'disabled')),
          published_at TEXT,
          disabled_at TEXT,
          moderation_reason TEXT,
          moderated_by TEXT REFERENCES admin_accounts(user_id),
          moderated_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO recruitment_posts_new
          SELECT id, recruiter_role_profile_id, job_type, salary_range, settlement_method, location_text,
            latitude, longitude, status, published_at, disabled_at, moderation_reason, moderated_by,
            moderated_at, created_at, updated_at
          FROM recruitment_posts;
        DROP TABLE recruitment_posts;
        ALTER TABLE recruitment_posts_new RENAME TO recruitment_posts;
      `);
    }
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length) throw new Error('MARKET_SCHEMA_FOREIGN_KEY_VIOLATION');
    db.exec('COMMIT; PRAGMA foreign_keys = ON');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    db.exec('PRAGMA foreign_keys = ON');
    throw error;
  }
}

function createMarketIndexes(db) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS recruitment_posts_market_idx
      ON recruitment_posts(status, published_at, id);
    CREATE INDEX IF NOT EXISTS applicant_information_market_idx
      ON applicant_job_seeking_information(visibility_status, published_at, role_profile_id);
  `);
}

function migrateReviewActions(db) {
  const columns = db.prepare('PRAGMA table_info(review_actions)').all().map((column) => column.name);
  if (columns.includes('reviewer_user_id') && !columns.includes('admin_user_id')) {
    // Preserve historical WeChat-review records while moving new decisions to admin sessions.
    db.exec('ALTER TABLE review_actions ADD COLUMN admin_user_id TEXT REFERENCES admin_accounts(user_id)');
  }
}
