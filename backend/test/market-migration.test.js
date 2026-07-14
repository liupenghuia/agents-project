import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../src/db.js';

test('existing market tables are migrated to the moderation state vocabulary without data loss', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'market-migration-'));
  const path = join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE role_profiles (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL,
      review_status TEXT NOT NULL, submitted_at TEXT NOT NULL, reviewed_at TEXT, review_reason TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, role)
    );
    CREATE TABLE applicant_job_seeking_information (
      role_profile_id TEXT PRIMARY KEY REFERENCES role_profiles(id) ON DELETE CASCADE,
      job_type_name TEXT NOT NULL, age INTEGER NOT NULL, expected_salary TEXT NOT NULL,
      work_method TEXT NOT NULL, location_text TEXT NOT NULL, latitude REAL NOT NULL,
      longitude REAL NOT NULL, preferred_work_scope TEXT,
      visibility_status TEXT NOT NULL DEFAULT 'published' CHECK (visibility_status IN ('published', 'disabled')),
      published_at TEXT, disabled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE recruitment_posts (
      id TEXT PRIMARY KEY, recruiter_role_profile_id TEXT NOT NULL REFERENCES role_profiles(id) ON DELETE CASCADE,
      job_type TEXT NOT NULL, salary_range TEXT NOT NULL, settlement_method TEXT NOT NULL,
      location_text TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('published', 'disabled')),
      published_at TEXT, disabled_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO users VALUES ('user-1', NULL, 'Legacy User', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    INSERT INTO role_profiles VALUES ('applicant-1', 'user-1', 'applicant', 'approved', '2026-01-01T00:00:00.000Z', NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    INSERT INTO role_profiles VALUES ('recruiter-1', 'user-1', 'recruiter', 'approved', '2026-01-01T00:00:00.000Z', NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    INSERT INTO applicant_job_seeking_information VALUES ('applicant-1', '木工', 30, '面议', 'monthly_settlement', '上海', 31, 121, NULL, 'disabled', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    INSERT INTO recruitment_posts VALUES ('post-1', 'recruiter-1', '木工', '面议', '月结', '上海', 31, 121, 'published', '2026-01-01T00:00:00.000Z', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  `);
  legacy.close();

  const db = createDatabase(path);
  try {
    const applicantSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'applicant_job_seeking_information'").get().sql;
    const postSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recruitment_posts'").get().sql;
    assert.match(applicantSql, /pending_review/);
    assert.match(postSql, /changes_requested/);
    assert.equal(db.prepare('SELECT visibility_status FROM applicant_job_seeking_information WHERE role_profile_id = ?').get('applicant-1').visibility_status, 'disabled');
    assert.equal(db.prepare('SELECT status FROM recruitment_posts WHERE id = ?').get('post-1').status, 'published');
    db.prepare("UPDATE recruitment_posts SET status = 'changes_requested', moderation_reason = '补充说明' WHERE id = 'post-1'").run();
    assert.equal(db.prepare("SELECT status FROM recruitment_posts WHERE id = 'post-1'").get().status, 'changes_requested');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
