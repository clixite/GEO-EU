/**
 * Ordered, append-only schema migrations. Never edit an applied migration; add a new
 * one. Every table carries `tenant_id` where tenant isolation matters, and JSON
 * columns hold canonical JSON produced by `canonicalJson`.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'audit-ledger',
    sql: `
      CREATE TABLE IF NOT EXISTS audit_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        ts TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        request_id TEXT,
        policy_id TEXT,
        model_id TEXT,
        approval_id TEXT,
        previous_state TEXT,
        new_state TEXT,
        evidence TEXT,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE
      );
      CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts ON audit_events(tenant_id, ts);
      CREATE INDEX IF NOT EXISTS idx_audit_object ON audit_events(object_type, object_id);
    `,
  },
  {
    version: 2,
    name: 'knowledge',
    sql: `
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        locator TEXT NOT NULL,
        title TEXT,
        owner TEXT,
        authority_level TEXT NOT NULL DEFAULT 'internal',
        licence TEXT,
        language TEXT,
        valid_from TEXT,
        valid_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, locator)
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        fingerprint TEXT NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'text/plain',
        language TEXT,
        fetched_at TEXT NOT NULL,
        published_at TEXT,
        modified_at TEXT,
        metadata TEXT,
        UNIQUE(tenant_id, source_id, fingerprint)
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        heading_path TEXT,
        text TEXT NOT NULL,
        char_start INTEGER NOT NULL,
        char_end INTEGER NOT NULL,
        token_estimate INTEGER NOT NULL,
        embedding BLOB,
        embedding_model TEXT,
        UNIQUE(document_id, ordinal)
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text, heading_path, chunk_id UNINDEXED, tenant_id UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL,
        text TEXT NOT NULL,
        kind TEXT NOT NULL,
        confidence REAL NOT NULL,
        entities TEXT,
        valid_from TEXT,
        valid_until TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_claims_tenant ON claims(tenant_id);
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        aliases TEXT,
        same_as TEXT,
        description TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(tenant_id, canonical_name, kind)
      );
      CREATE TABLE IF NOT EXISTS entity_mentions (
        entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        chunk_id TEXT NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
        surface TEXT NOT NULL,
        PRIMARY KEY(entity_id, chunk_id, surface)
      );
    `,
  },
  {
    version: 3,
    name: 'governance',
    sql: `
      CREATE TABLE IF NOT EXISTS ai_systems (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        record TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, name)
      );
      CREATE TABLE IF NOT EXISTS model_registry (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        record TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(tenant_id, provider, model)
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        action TEXT NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL,
        decided_by TEXT,
        decided_at TEXT,
        decision_note TEXT,
        policy_id TEXT,
        payload_hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(tenant_id, status);
      CREATE TABLE IF NOT EXISTS processing_records (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        record TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 4,
    name: 'content-and-publishing',
    sql: `
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        author TEXT,
        reviewer TEXT,
        ai_assisted INTEGER NOT NULL DEFAULT 0,
        model_id TEXT,
        evidence TEXT,
        readiness TEXT,
        gate_result TEXT,
        approval_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT,
        UNIQUE(tenant_id, slug)
      );
      CREATE TABLE IF NOT EXISTS publications (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        draft_id TEXT NOT NULL REFERENCES drafts(id),
        target TEXT NOT NULL,
        status TEXT NOT NULL,
        receipt TEXT,
        request_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );
    `,
  },
  {
    version: 5,
    name: 'observatory',
    sql: `
      CREATE TABLE IF NOT EXISTS query_sets (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        record TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(tenant_id, name, version)
      );
      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        query_set_id TEXT NOT NULL REFERENCES query_sets(id),
        query_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        model_version TEXT,
        retrieval_mode TEXT,
        language TEXT,
        geography TEXT,
        sample_index INTEGER NOT NULL,
        observed_at TEXT NOT NULL,
        response_hash TEXT NOT NULL,
        brand_mentioned INTEGER NOT NULL,
        cited INTEGER NOT NULL,
        citation_urls TEXT,
        competitor_mentions TEXT,
        answer_position INTEGER,
        record TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_obs_query ON observations(tenant_id, query_set_id, query_id, provider, model);
    `,
  },
  {
    version: 6,
    name: 'cost-and-usage',
    sql: `
      CREATE TABLE IF NOT EXISTS model_calls (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        request_id TEXT,
        job_id TEXT,
        workload TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        started_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cached_tokens INTEGER NOT NULL DEFAULT 0,
        cost_eur REAL,
        status TEXT NOT NULL,
        retries INTEGER NOT NULL DEFAULT 0,
        policy_id TEXT,
        prompt_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_calls_tenant_time ON model_calls(tenant_id, started_at);
    `,
  },
];
