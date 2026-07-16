/**
 * Minimal schema_migrations runner.
 * Migrations are ordered, versioned, and recorded after successful up().
 * Prefer idempotent up() so re-runs after partial failure remain safe when using IF NOT EXISTS.
 */

export function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

export function listAppliedMigrations(db) {
  ensureMigrationsTable(db);
  return db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version').all();
}

export function isMigrationApplied(db, version) {
  ensureMigrationsTable(db);
  return Boolean(db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version));
}

export function markMigrationApplied(db, version, appliedAt = new Date().toISOString()) {
  ensureMigrationsTable(db);
  db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(version, appliedAt);
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Array<{ version: string, up: (db: any) => void }>} migrations
 */
export function runMigrations(db, migrations) {
  ensureMigrationsTable(db);
  const applied = [];
  for (const migration of migrations) {
    if (!migration?.version || typeof migration.up !== 'function') {
      throw new Error('Invalid migration entry: need { version, up }');
    }
    if (isMigrationApplied(db, migration.version)) continue;
    migration.up(db);
    markMigrationApplied(db, migration.version);
    applied.push(migration.version);
  }
  return applied;
}
