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
      visibility_status TEXT NOT NULL DEFAULT 'published' CHECK (visibility_status IN ('published', 'disabled')),
      published_at TEXT,
      disabled_at TEXT,
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
      status TEXT NOT NULL CHECK (status IN ('published', 'disabled')),
      published_at TEXT,
      disabled_at TEXT,
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
    CREATE INDEX IF NOT EXISTS applicant_favorites_created_idx ON applicant_favorites(applicant_role_profile_id, created_at);
    CREATE INDEX IF NOT EXISTS recruiter_favorites_created_idx ON recruiter_favorites(recruiter_role_profile_id, created_at);
    CREATE INDEX IF NOT EXISTS market_contact_views_idx ON market_contact_views(viewer_user_id, target_type, target_id, created_at);
    CREATE INDEX IF NOT EXISTS market_reports_status_idx ON market_reports(status, created_at);
  `);
  migrateMarketColumns(db);
  migrateReviewActions(db);
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
  addColumn('recruitment_posts', 'published_at', 'TEXT');
  addColumn('recruitment_posts', 'disabled_at', 'TEXT');
  db.exec('UPDATE applicant_job_seeking_information SET published_at = COALESCE(published_at, created_at) WHERE published_at IS NULL');
  db.exec('UPDATE recruitment_posts SET published_at = COALESCE(published_at, created_at) WHERE published_at IS NULL');
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

export function findRoleProfileForUser(db, userId, role) {
  return db.prepare('SELECT id, user_id, role FROM role_profiles WHERE user_id = ? AND role = ?').get(userId, role) || null;
}

function roleProfileForUser(db, userId, role) {
  const profile = findRoleProfileForUser(db, userId, role);
  if (!profile) {
    const error = new Error(`需要先创建${role === 'applicant' ? '应聘' : '招人'}身份`);
    error.status = 403;
    error.code = 'IDENTITY_REQUIRED';
    throw error;
  }
  return profile;
}

function locationValid(latitude, longitude) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function getApplicantJobSeekingInformation(db, userId) {
  const profile = roleProfileForUser(db, userId, 'applicant');
  return db.prepare('SELECT * FROM applicant_job_seeking_information WHERE role_profile_id = ?').get(profile.id) || null;
}

export function upsertApplicantJobSeekingInformation(db, userId, data) {
  const profile = roleProfileForUser(db, userId, 'applicant');
  if (!locationValid(data.latitude, data.longitude)) throw new Error('INVALID_COORDINATES');
  const timestamp = now();
  db.prepare(`INSERT INTO applicant_job_seeking_information(
      role_profile_id, job_type_name, age, expected_salary, work_method, location_text,
      latitude, longitude, preferred_work_scope, visibility_status, published_at, disabled_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, NULL, ?, ?)
    ON CONFLICT(role_profile_id) DO UPDATE SET
      job_type_name = excluded.job_type_name, age = excluded.age, expected_salary = excluded.expected_salary,
      work_method = excluded.work_method, location_text = excluded.location_text, latitude = excluded.latitude,
      longitude = excluded.longitude, preferred_work_scope = excluded.preferred_work_scope, visibility_status = 'published',
      disabled_at = NULL, published_at = COALESCE(applicant_job_seeking_information.published_at, excluded.published_at), updated_at = excluded.updated_at`)
    .run(profile.id, data.jobTypeName, data.age, data.expectedSalary, data.workMethod, data.locationText,
      data.latitude, data.longitude, data.preferredWorkScope || null, timestamp, timestamp, timestamp);
  return getApplicantJobSeekingInformation(db, userId);
}

export function getRecruiterInformation(db, userId) {
  const profile = roleProfileForUser(db, userId, 'recruiter');
  return db.prepare('SELECT * FROM recruiter_information WHERE role_profile_id = ?').get(profile.id) || null;
}

export function upsertRecruiterInformation(db, userId, data) {
  const profile = roleProfileForUser(db, userId, 'recruiter');
  if (!locationValid(data.latitude, data.longitude)) throw new Error('INVALID_COORDINATES');
  const timestamp = now();
  db.prepare(`INSERT INTO recruiter_information(role_profile_id, latitude, longitude, detailed_address, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(role_profile_id) DO UPDATE SET latitude = excluded.latitude, longitude = excluded.longitude,
      detailed_address = excluded.detailed_address, updated_at = excluded.updated_at`)
    .run(profile.id, data.latitude, data.longitude, data.detailedAddress, timestamp, timestamp);
  return getRecruiterInformation(db, userId);
}

export function createMediaUpload(db, userId, { objectKey, contentType, byteSize, expiresAt }) {
  db.prepare(`INSERT INTO media_uploads(object_key, user_id, content_type, byte_size, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(objectKey, userId, contentType, byteSize, expiresAt, now());
  return { objectKey, contentType, byteSize, expiresAt };
}

export function completeMediaUpload(db, userId, objectKey, byteSize) {
  const upload = db.prepare('SELECT * FROM media_uploads WHERE object_key = ? AND user_id = ?').get(objectKey, userId);
  if (!upload || upload.expires_at <= now() || upload.completed_at) return null;
  if (byteSize > upload.byte_size) return null;
  db.prepare('UPDATE media_uploads SET completed_at = ? WHERE object_key = ?').run(now(), objectKey);
  return upload;
}

function recruitmentPostFromRow(db, row) {
  if (!row) return null;
  return {
    id: row.id,
    recruiterRoleProfileId: row.recruiter_role_profile_id,
    jobType: row.job_type,
    salaryRange: row.salary_range,
    settlementMethod: row.settlement_method,
    locationText: row.location_text,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    publishedAt: row.published_at || row.created_at,
    ...(row.disabled_at ? { disabledAt: row.disabled_at } : {}),
    images: db.prepare(`SELECT id, object_key, content_type, byte_size, sort_order FROM recruitment_post_images
      WHERE recruitment_post_id = ? ORDER BY sort_order ASC`).all(row.id).map((image) => ({
      id: image.id, objectKey: image.object_key, contentType: image.content_type,
      byteSize: image.byte_size, sortOrder: image.sort_order,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recruiterProfileForUser(db, userId) {
  return roleProfileForUser(db, userId, 'recruiter');
}

export function listRecruitmentPosts(db, userId) {
  const profile = recruiterProfileForUser(db, userId);
  return db.prepare('SELECT * FROM recruitment_posts WHERE recruiter_role_profile_id = ? ORDER BY created_at DESC')
    .all(profile.id).map((row) => recruitmentPostFromRow(db, row));
}

export function getRecruitmentPost(db, userId, postId) {
  const profile = recruiterProfileForUser(db, userId);
  const row = db.prepare('SELECT * FROM recruitment_posts WHERE id = ? AND recruiter_role_profile_id = ?').get(postId, profile.id);
  return recruitmentPostFromRow(db, row);
}

function validateUploadKeys(db, userId, imageKeys) {
  if (!Array.isArray(imageKeys) || imageKeys.length > 6 || new Set(imageKeys).size !== imageKeys.length) return null;
  const uploads = imageKeys.map((key) => db.prepare(`SELECT * FROM media_uploads WHERE object_key = ? AND user_id = ?
    AND completed_at IS NOT NULL AND expires_at > ?`).get(key, userId, now()));
  return uploads.every(Boolean) ? uploads : null;
}

export function createRecruitmentPost(db, userId, data) {
  const profile = recruiterProfileForUser(db, userId);
  const uploads = validateUploadKeys(db, userId, data.imageKeys);
  if (!uploads) throw new Error('INVALID_IMAGE_REFERENCES');
  const timestamp = now();
  const postId = randomBytes(16).toString('hex');
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO recruitment_posts(id, recruiter_role_profile_id, job_type, salary_range, settlement_method,
      location_text, latitude, longitude, status, published_at, disabled_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, NULL, ?, ?)`).run(postId, profile.id, data.jobType, data.salaryRange,
    data.settlementMethod, data.locationText, data.latitude, data.longitude, timestamp, timestamp, timestamp);
    data.imageKeys.forEach((key, index) => {
      const upload = uploads[index];
      db.prepare(`INSERT INTO recruitment_post_images(id, recruitment_post_id, object_key, content_type, byte_size, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomBytes(16).toString('hex'), postId, key, upload.content_type, upload.byte_size, index, timestamp);
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getRecruitmentPost(db, userId, postId);
}

export function updateRecruitmentPost(db, userId, postId, data) {
  const current = getRecruitmentPost(db, userId, postId);
  if (!current) return null;
  const next = { ...current, ...data, imageKeys: data.imageKeys || current.images.map((image) => image.objectKey) };
  const uploads = validateUploadKeys(db, userId, next.imageKeys);
  if (!uploads) throw new Error('INVALID_IMAGE_REFERENCES');
  const timestamp = now();
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE recruitment_posts SET job_type = ?, salary_range = ?, settlement_method = ?, location_text = ?,
      latitude = ?, longitude = ?, updated_at = ? WHERE id = ?`).run(next.jobType, next.salaryRange, next.settlementMethod,
      next.locationText, next.latitude, next.longitude, timestamp, postId);
    db.prepare('DELETE FROM recruitment_post_images WHERE recruitment_post_id = ?').run(postId);
    next.imageKeys.forEach((key, index) => {
      const upload = uploads[index];
      db.prepare(`INSERT INTO recruitment_post_images(id, recruitment_post_id, object_key, content_type, byte_size, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomBytes(16).toString('hex'), postId, key, upload.content_type, upload.byte_size, index, timestamp);
    });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getRecruitmentPost(db, userId, postId);
}

function publicUser(row) {
  return row ? { id: row.id, email: row.email, name: row.name, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

export function listUsers(db) {
  return db.prepare('SELECT id, email, name, status, created_at, updated_at FROM users ORDER BY created_at DESC').all().map(publicUser);
}

export function getUser(db, userId) {
  return publicUser(db.prepare('SELECT id, email, name, status, created_at, updated_at FROM users WHERE id = ?').get(userId));
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
  return getUser(db, userId);
}

export function disableUser(db, userId) {
  return updateManagedUser(db, userId, { status: 'disabled' });
}

function marketRole(db, userId, role) { return roleProfileForUser(db, userId, role); }

function approvedCounterpart(db, userId, role) {
  return db.prepare("SELECT id FROM role_profiles WHERE user_id = ? AND role = ? AND review_status = 'approved'").get(userId, role) || null;
}

function applicantMarketRow(db, row, includeContact = false) {
  if (!row) return null;
  const result = {
    id: row.role_profile_id, jobTypeName: row.job_type_name, age: row.age, expectedSalary: row.expected_salary,
    workMethod: row.work_method, locationText: row.location_text, preferredWorkScope: row.preferred_work_scope || null,
    status: row.visibility_status, publishedAt: row.published_at || row.created_at, updatedAt: row.updated_at,
  };
  if (includeContact) result.contactPhone = row.contact_phone;
  return result;
}

function recruiterMarketRow(db, row, includeContact = false) {
  if (!row) return null;
  const result = {
    id: row.id, jobType: row.job_type, salaryRange: row.salary_range, settlementMethod: row.settlement_method,
    locationText: row.location_text, status: row.status, publishedAt: row.published_at || row.created_at,
    updatedAt: row.updated_at, images: db.prepare('SELECT object_key AS objectKey, sort_order AS sortOrder FROM recruitment_post_images WHERE recruitment_post_id = ? ORDER BY sort_order').all(row.id),
  };
  if (includeContact) result.contactPhone = row.contact_phone;
  return result;
}

function assertMarketViewer(db, userId, targetRole) {
  const profile = approvedCounterpart(db, userId, targetRole);
  if (!profile) throw new Error('COUNTERPART_IDENTITY_REQUIRED');
  return profile;
}

export function listMarketRecruitmentPosts(db, userId, { cursor = null, limit = 20, keyword = '' } = {}) {
  assertMarketViewer(db, userId, 'applicant');
  const rows = db.prepare(`SELECT rp.*, r.contact_phone FROM recruitment_posts rp
    JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id AND role.review_status = 'approved'
    JOIN recruiter_profiles r ON r.role_profile_id = rp.recruiter_role_profile_id
    WHERE rp.status = 'published' AND (? = '' OR rp.job_type LIKE ?)
    ORDER BY COALESCE(rp.published_at, rp.created_at) DESC LIMIT ?`).all(keyword, `%${keyword}%`, Math.min(Math.max(limit, 1), 50));
  return { items: rows.map((row) => recruiterMarketRow(db, row)), nextCursor: rows.length === limit ? rows.at(-1).published_at || rows.at(-1).created_at : null };
}

export function getMarketRecruitmentPost(db, userId, postId) {
  assertMarketViewer(db, userId, 'applicant');
  const row = db.prepare(`SELECT rp.*, r.contact_phone FROM recruitment_posts rp JOIN role_profiles role ON role.id = rp.recruiter_role_profile_id
    JOIN recruiter_profiles r ON r.role_profile_id = rp.recruiter_role_profile_id WHERE rp.id = ? AND rp.status = 'published' AND role.review_status = 'approved'`).get(postId);
  if (!row) return null;
  return recruiterMarketRow(db, row, true);
}

export function listMarketJobSeekingInformation(db, userId, { limit = 20, keyword = '' } = {}) {
  assertMarketViewer(db, userId, 'recruiter');
  const rows = db.prepare(`SELECT i.*, a.contact_phone FROM applicant_job_seeking_information i
    JOIN role_profiles role ON role.id = i.role_profile_id AND role.review_status = 'approved'
    JOIN applicant_profiles a ON a.role_profile_id = i.role_profile_id
    WHERE i.visibility_status = 'published' AND (? = '' OR i.job_type_name LIKE ?)
    ORDER BY COALESCE(i.published_at, i.created_at) DESC LIMIT ?`).all(keyword, `%${keyword}%`, Math.min(Math.max(limit, 1), 50));
  return { items: rows.map((row) => applicantMarketRow(db, row)), nextCursor: rows.length === limit ? rows.at(-1).published_at || rows.at(-1).created_at : null };
}

export function getMarketJobSeekingInformation(db, userId, informationId) {
  assertMarketViewer(db, userId, 'recruiter');
  const row = db.prepare(`SELECT i.*, a.contact_phone FROM applicant_job_seeking_information i JOIN role_profiles role ON role.id = i.role_profile_id
    JOIN applicant_profiles a ON a.role_profile_id = i.role_profile_id WHERE i.role_profile_id = ? AND i.visibility_status = 'published' AND role.review_status = 'approved'`).get(informationId);
  return applicantMarketRow(db, row, Boolean(row));
}

export function setMarketVisibility(db, userId, type, id, enabled) {
  const timestamp = now();
  if (type === 'applicant_information') {
    const profile = marketRole(db, userId, 'applicant');
    const result = db.prepare('UPDATE applicant_job_seeking_information SET visibility_status = ?, disabled_at = ?, updated_at = ? WHERE role_profile_id = ?')
      .run(enabled ? 'published' : 'disabled', enabled ? null : timestamp, timestamp, profile.id);
    return result.changes > 0;
  }
  const profile = marketRole(db, userId, 'recruiter');
  const result = db.prepare('UPDATE recruitment_posts SET status = ?, disabled_at = ?, updated_at = ? WHERE id = ? AND recruiter_role_profile_id = ?')
    .run(enabled ? 'published' : 'disabled', enabled ? null : timestamp, timestamp, id, profile.id);
  return result.changes > 0;
}

export function setFavorite(db, userId, direction, targetId, enabled) {
  const timestamp = now();
  if (direction === 'recruitment') {
    const profile = marketRole(db, userId, 'applicant');
    if (!db.prepare("SELECT id FROM recruitment_posts WHERE id = ? AND status = 'published'").get(targetId)) return false;
    if (enabled) db.prepare('INSERT OR IGNORE INTO applicant_favorites VALUES (?, ?, ?)').run(profile.id, targetId, timestamp);
    else db.prepare('DELETE FROM applicant_favorites WHERE applicant_role_profile_id = ? AND recruitment_post_id = ?').run(profile.id, targetId);
    return true;
  }
  const profile = marketRole(db, userId, 'recruiter');
  if (!db.prepare("SELECT role_profile_id FROM applicant_job_seeking_information WHERE role_profile_id = ? AND visibility_status = 'published'").get(targetId)) return false;
  if (enabled) db.prepare('INSERT OR IGNORE INTO recruiter_favorites VALUES (?, ?, ?)').run(profile.id, targetId, timestamp);
  else db.prepare('DELETE FROM recruiter_favorites WHERE recruiter_role_profile_id = ? AND applicant_information_role_profile_id = ?').run(profile.id, targetId);
  return true;
}

export function listFavorites(db, userId, direction) {
  if (direction === 'recruitment') {
    const profile = marketRole(db, userId, 'applicant');
    return db.prepare('SELECT f.recruitment_post_id AS id, f.created_at AS favoritedAt, rp.status, rp.published_at AS publishedAt, rp.job_type AS jobType, rp.salary_range AS salaryRange FROM applicant_favorites f JOIN recruitment_posts rp ON rp.id = f.recruitment_post_id WHERE f.applicant_role_profile_id = ? ORDER BY f.created_at DESC').all(profile.id);
  }
  const profile = marketRole(db, userId, 'recruiter');
  return db.prepare('SELECT f.applicant_information_role_profile_id AS id, f.created_at AS favoritedAt, i.visibility_status AS status, i.published_at AS publishedAt, i.job_type_name AS jobTypeName, i.expected_salary AS expectedSalary FROM recruiter_favorites f JOIN applicant_job_seeking_information i ON i.role_profile_id = f.applicant_information_role_profile_id WHERE f.recruiter_role_profile_id = ? ORDER BY f.created_at DESC').all(profile.id);
}

export function createMarketReport(db, userId, { targetType, targetId, reason }) {
  const valid = targetType === 'recruitment_post'
    ? db.prepare('SELECT id FROM recruitment_posts WHERE id = ?').get(targetId)
    : db.prepare('SELECT role_profile_id FROM applicant_job_seeking_information WHERE role_profile_id = ?').get(targetId);
  if (!valid) return null;
  const id = randomUUID();
  db.prepare('INSERT INTO market_reports(id, reporter_user_id, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, targetType, targetId, reason, now());
  return db.prepare('SELECT * FROM market_reports WHERE id = ?').get(id);
}

export function listMarketReports(db, status = null) {
  const rows = status ? db.prepare('SELECT * FROM market_reports WHERE status = ? ORDER BY created_at DESC').all(status) : db.prepare('SELECT * FROM market_reports ORDER BY created_at DESC').all();
  return rows.map((row) => ({ id: row.id, targetType: row.target_type, targetId: row.target_id, reason: row.reason, status: row.status, createdAt: row.created_at, resolvedAt: row.resolved_at || null }));
}

export function resolveMarketReport(db, adminUserId, reportId, decision) {
  const report = db.prepare('SELECT * FROM market_reports WHERE id = ?').get(reportId);
  if (!report) return null;
  const timestamp = now();
  db.prepare('UPDATE market_reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?').run(decision, adminUserId, timestamp, reportId);
  if (decision === 'resolved') {
    if (report.target_type === 'recruitment_post') db.prepare("UPDATE recruitment_posts SET status = 'disabled', disabled_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, report.target_id);
    else db.prepare("UPDATE applicant_job_seeking_information SET visibility_status = 'disabled', disabled_at = ?, updated_at = ? WHERE role_profile_id = ?").run(timestamp, timestamp, report.target_id);
  }
  return listMarketReports(db).find((item) => item.id === reportId);
}

export function recordContactView(db, userId, targetType, targetId) {
  const recent = db.prepare('SELECT COUNT(*) AS count FROM market_contact_views WHERE viewer_user_id = ? AND created_at > ?').get(userId, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent.count >= 30) return false;
  db.prepare('INSERT INTO market_contact_views(id, viewer_user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), userId, targetType, targetId, now());
  return true;
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
