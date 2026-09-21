import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations.ts';

export interface OpenOptions {
  /** File path or ':memory:'. */
  path?: string;
  /** Skip migrations (only for tests of the migration runner itself). */
  migrate?: boolean;
}

export interface Database {
  readonly raw: DatabaseSync;
  readonly path: string;
  transaction<T>(fn: () => T): T;
  close(): void;
}

/**
 * Open (or create) the Evidentia store and apply pending migrations.
 * Pragmas: WAL for durability/concurrency, foreign keys enforced, secure_delete so
 * erased personal data does not linger in free pages (GDPR erasure support).
 * All SQL executed here is static DDL from `migrations.ts`; user data only ever
 * flows through prepared statements with bound parameters.
 */
export function openDatabase(options: OpenOptions = {}): Database {
  const path = options.path ?? ':memory:';
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec('PRAGMA secure_delete = ON;');
  if (path !== ':memory:') raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);',
  );
  if (options.migrate !== false) applyMigrations(raw);

  let depth = 0;
  const db: Database = {
    raw,
    path,
    transaction<T>(fn: () => T): T {
      // Nested calls join the outer transaction (SQLite has no nested BEGIN).
      if (depth > 0) return fn();
      raw.exec('BEGIN');
      depth += 1;
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth -= 1;
      }
    },
    close: () => raw.close(),
  };
  return db;
}

export function applyMigrations(raw: DatabaseSync): number[] {
  const applied = new Set(
    (raw.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  );
  const done: number[] = [];
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    raw.exec('BEGIN');
    try {
      raw.exec(m.sql);
      raw
        .prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)')
        .run(m.version, m.name, new Date().toISOString());
      raw.exec('COMMIT');
      done.push(m.version);
    } catch (error) {
      raw.exec('ROLLBACK');
      throw error;
    }
  }
  return done;
}

export function currentSchemaVersion(db: Database): number {
  const row = db.raw.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as {
    v: number | null;
  };
  return row.v ?? 0;
}
