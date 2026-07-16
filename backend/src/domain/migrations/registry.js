/**
 * Ordered, versioned schema migrations.
 * Versions use YYYYMMDD_NNN so lexical order matches apply order.
 * Each up() must be safe to skip when already applied (runner records version).
 * Prefer IF NOT EXISTS / column-existence checks for partial legacy DBs.
 */

import { ensureCollaborationSchema } from '../collaboration.js';

function addColumnIfMissing(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((item) => item.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function migrateMarketColumns(db) {
  addColumnIfMissing(db, 'applicant_job_seeking_information', 'visibility_status', "TEXT NOT NULL DEFAULT 'published'");
  addColumnIfMissing(db, 'applicant_job_seeking_information', 'published_at', 'TEXT');
  addColumnIfMissing(db, 'applicant_job_seeking_information', 'disabled_at', 'TEXT');
  addColumnIfMissing(db, 'applicant_job_seeking_information', 'moderation_reason', 'TEXT');
  addColumnIfMissing(db, 'applicant_job_seeking_information', 'moderated_by', 'TEXT REFERENCES admin_accounts(user_id)');
  addColumnIfMissing(db, 'applicant_job_seeking_information', 'moderated_at', 'TEXT');
  addColumnIfMissing(db, 'recruitment_posts', 'published_at', 'TEXT');
  addColumnIfMissing(db, 'recruitment_posts', 'disabled_at', 'TEXT');
  addColumnIfMissing(db, 'recruitment_posts', 'moderation_reason', 'TEXT');
  addColumnIfMissing(db, 'recruitment_posts', 'moderated_by', 'TEXT REFERENCES admin_accounts(user_id)');
  addColumnIfMissing(db, 'recruitment_posts', 'moderated_at', 'TEXT');
  addColumnIfMissing(db, 'applicant_job_seeking_information', 'expires_at', 'TEXT');
  addColumnIfMissing(db, 'recruitment_posts', 'expires_at', 'TEXT');
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
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
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
    db.exec('ALTER TABLE review_actions ADD COLUMN admin_user_id TEXT REFERENCES admin_accounts(user_id)');
  }
}

/** @type {Array<{ version: string, up: (db: any) => void }>} */
export const MIGRATIONS = [
  {
    version: '20240714_001_market_columns',
    up: migrateMarketColumns,
  },
  {
    version: '20240714_002_market_status_constraints',
    up: migrateMarketStatusConstraints,
  },
  {
    version: '20240714_003_market_indexes',
    up: createMarketIndexes,
  },
  {
    version: '20240714_004_review_actions_admin',
    up: migrateReviewActions,
  },
  {
    version: '20240714_005_collaboration_schema',
    up: ensureCollaborationSchema,
  },
];
