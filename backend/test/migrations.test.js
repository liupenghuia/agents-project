import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db.js';
import { listAppliedMigrations, runMigrations, isMigrationApplied } from '../src/domain/migrations/runner.js';
import { MIGRATIONS } from '../src/domain/migrations/registry.js';

test('createDatabase records schema_migrations versions', () => {
  const db = createDatabase(':memory:');
  const applied = listAppliedMigrations(db);
  assert.ok(applied.length >= MIGRATIONS.length);
  for (const migration of MIGRATIONS) {
    assert.equal(isMigrationApplied(db, migration.version), true);
  }
  db.close();
});

test('runMigrations is idempotent and skips already applied versions', () => {
  const db = createDatabase(':memory:');
  const first = listAppliedMigrations(db);
  const again = runMigrations(db, MIGRATIONS);
  assert.deepEqual(again, []);
  assert.equal(listAppliedMigrations(db).length, first.length);
  db.close();
});

test('runner applies a new version only once', () => {
  const db = createDatabase(':memory:');
  let calls = 0;
  const extra = {
    version: '20990101_999_test_only',
    up() { calls += 1; },
  };
  assert.deepEqual(runMigrations(db, [extra]), ['20990101_999_test_only']);
  assert.deepEqual(runMigrations(db, [extra]), []);
  assert.equal(calls, 1);
  assert.equal(isMigrationApplied(db, extra.version), true);
  db.close();
});
