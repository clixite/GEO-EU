import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSchemaVersion, openDatabase } from '../../src/storage/database.ts';
import { migrations } from '../../src/storage/migrations.ts';

test('openDatabase applies all migrations once and is idempotent', () => {
  const db = openDatabase();
  assert.equal(currentSchemaVersion(db), migrations.at(-1)?.version);
  const tables = (db.raw.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").all() as { name: string }[]).map((r) => r.name);
  for (const t of ['audit_events', 'sources', 'documents', 'chunks', 'claims', 'entities', 'ai_systems', 'model_registry', 'approvals', 'drafts', 'publications', 'query_sets', 'observations', 'model_calls']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
  assert.ok(tables.includes('chunks_fts'), 'fts5 virtual table missing');
  db.close();
});

test('transaction rolls back on error and supports nesting', () => {
  const db = openDatabase();
  const insert = () => db.raw.prepare("INSERT INTO entities(id, tenant_id, canonical_name, kind, created_at) VALUES (?, 't', ?, 'org', 'now')");
  assert.throws(() =>
    db.transaction(() => {
      insert().run('e1', 'Alpha');
      db.transaction(() => insert().run('e2', 'Beta'));
      throw new Error('boom');
    }),
  );
  const count = (db.raw.prepare('SELECT COUNT(*) AS n FROM entities').get() as { n: number }).n;
  assert.equal(count, 0);
  db.close();
});

test('migrations are strictly increasing and uniquely named', () => {
  const versions = migrations.map((m) => m.version);
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
  assert.equal(new Set(versions).size, versions.length);
  assert.equal(new Set(migrations.map((m) => m.name)).size, migrations.length);
});
