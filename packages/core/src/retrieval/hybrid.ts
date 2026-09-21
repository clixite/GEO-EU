import type { Database } from '../storage/database.ts';
import { cosine } from '../providers/localEmbedding.ts';
import type { AuthorityLevel } from '../knowledge/store.ts';
import { type Clock, systemClock } from '../shared/clock.ts';

/**
 * Hybrid retrieval: BM25 over FTS5 + vector similarity, fused by reciprocal rank
 * fusion, filtered by metadata, then re-ranked with explainable signals (source
 * authority, freshness, exact phrase). Every hit carries full provenance so a
 * citation can be reconstructed: source locator, document, heading path, offsets.
 */

export interface RetrievalFilters {
  sourceIds?: readonly string[];
  authorityLevels?: readonly AuthorityLevel[];
  /** Only chunks from documents valid at this instant (source validFrom/validUntil). */
  asOf?: string;
  language?: string;
  /** Quarantined (suspected prompt-injection) documents are excluded unless explicitly requested. */
  includeQuarantined?: boolean;
}

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  sourceId: string;
  locator: string;
  documentTitle: string | null;
  headingPath: string;
  text: string;
  charStart: number;
  charEnd: number;
  authorityLevel: AuthorityLevel;
  modifiedAt: string | null;
  score: number;
  signals: { lexicalRank: number | null; semanticRank: number | null; rrf: number; authority: number; freshness: number; phrase: number };
  subQuery: string;
}

export interface SearchOptions {
  k?: number;
  filters?: RetrievalFilters;
  decompose?: boolean;
  /** Provide to enable the semantic leg; omit for lexical-only retrieval. */
  embedQuery?: (text: string) => Promise<Float32Array>;
  candidatePool?: number;
}

const AUTHORITY_BOOST: Record<AuthorityLevel, number> = { official: 0.15, internal: 0.1, 'third-party': 0, unverified: -0.2 };
const RRF_K = 60;

interface ChunkRow {
  id: string;
  document_id: string;
  source_id: string;
  locator: string;
  title: string | null;
  heading_path: string | null;
  text: string;
  char_start: number;
  char_end: number;
  authority_level: AuthorityLevel;
  modified_at: string | null;
  published_at: string | null;
  fetched_at: string;
  language: string | null;
  valid_from: string | null;
  valid_until: string | null;
  embedding: Uint8Array | null;
}

/** Sanitise free text into an FTS5 query: quoted tokens, implicit AND. */
export function toFtsQuery(text: string, mode: 'and' | 'or' = 'and'): string {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1)
    .slice(0, 32);
  if (!tokens.length) return '""';
  return tokens.map((t) => `"${t.replace(/"/g, '')}"`).join(mode === 'and' ? ' AND ' : ' OR ');
}

/** Split a compound question into sub-queries (simple, deterministic). */
export function decomposeQuery(text: string): string[] {
  const parts = text
    .split(/\?|;|\band\b(?=\s+(?:what|how|which|when|where|why|who|is|are|does|do|can))/i)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).length >= 2);
  return parts.length > 1 ? [...new Set([text, ...parts])] : [text];
}

export class HybridRetriever {
  readonly db: Database;
  readonly clock: Clock;

  constructor(db: Database, options: { clock?: Clock } = {}) {
    this.db = db;
    this.clock = options.clock ?? systemClock;
  }

  #filterSql(f: RetrievalFilters | undefined, params: (string | number)[]): string {
    const where: string[] = [];
    if (f?.sourceIds?.length) {
      where.push(`s.id IN (${f.sourceIds.map(() => '?').join(',')})`);
      params.push(...f.sourceIds);
    }
    if (f?.authorityLevels?.length) {
      where.push(`s.authority_level IN (${f.authorityLevels.map(() => '?').join(',')})`);
      params.push(...f.authorityLevels);
    }
    if (f?.asOf) {
      where.push('(s.valid_from IS NULL OR s.valid_from <= ?) AND (s.valid_until IS NULL OR s.valid_until >= ?)');
      params.push(f.asOf, f.asOf);
    }
    if (f?.language) {
      where.push('(d.language IS NULL OR d.language = ?)');
      params.push(f.language);
    }
    if (!f?.includeQuarantined) where.push("(d.metadata IS NULL OR json_extract(d.metadata, '$.quarantine') IS NOT 1)");
    return where.length ? ' AND ' + where.join(' AND ') : '';
  }

  lexical(tenantId: string, query: string, k: number, filters?: RetrievalFilters): { row: ChunkRow; rank: number }[] {
    const run = (mode: 'and' | 'or') => {
      const params: (string | number)[] = [tenantId, toFtsQuery(query, mode)];
      const filterSql = this.#filterSql(filters, params);
      params.push(k);
      const sql = `SELECT c.id, c.document_id, s.id AS source_id, s.locator, d.title, c.heading_path, c.text, c.char_start, c.char_end, s.authority_level, d.modified_at, d.published_at, d.fetched_at, d.language, s.valid_from, s.valid_until, NULL AS embedding
        FROM chunks_fts f JOIN chunks c ON c.id = f.chunk_id JOIN documents d ON d.id = c.document_id JOIN sources s ON s.id = d.source_id
        WHERE f.tenant_id = ? AND chunks_fts MATCH ?${filterSql} ORDER BY bm25(chunks_fts, 1.0, 0.5) LIMIT ?`;
      return this.db.raw.prepare(sql).all(...params) as unknown as ChunkRow[];
    };
    let rows = run('and');
    if (rows.length < Math.min(3, k)) rows = [...rows, ...run('or').filter((r) => !rows.some((x) => x.id === r.id))].slice(0, k);
    return rows.map((row, i) => ({ row, rank: i + 1 }));
  }

  semantic(tenantId: string, vector: Float32Array, k: number, filters?: RetrievalFilters): { row: ChunkRow; rank: number; similarity: number }[] {
    const params: (string | number)[] = [tenantId];
    const filterSql = this.#filterSql(filters, params);
    const rows = this.db.raw
      .prepare(`SELECT c.id, c.document_id, s.id AS source_id, s.locator, d.title, c.heading_path, c.text, c.char_start, c.char_end, s.authority_level, d.modified_at, d.published_at, d.fetched_at, d.language, s.valid_from, s.valid_until, c.embedding
        FROM chunks c JOIN documents d ON d.id = c.document_id JOIN sources s ON s.id = d.source_id WHERE c.tenant_id = ? AND c.embedding IS NOT NULL${filterSql}`)
      .all(...params) as unknown as ChunkRow[];
    const scored = rows
      .map((row) => {
        const buf = row.embedding as Uint8Array;
        const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
        return { row, similarity: vec.length === vector.length ? cosine(vec, vector) : -1 };
      })
      .filter((r) => r.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
    return scored.map((r, i) => ({ ...r, rank: i + 1 }));
  }

  async search(tenantId: string, query: string, options: SearchOptions = {}): Promise<RetrievalHit[]> {
    const k = options.k ?? 8;
    const pool = options.candidatePool ?? Math.max(20, k * 4);
    const subQueries = options.decompose ? decomposeQuery(query) : [query];
    const merged = new Map<string, RetrievalHit>();
    const now = this.clock.now().getTime();

    for (const sq of subQueries) {
      const lex = this.lexical(tenantId, sq, pool, options.filters);
      const sem = options.embedQuery ? this.semantic(tenantId, await options.embedQuery(sq), pool, options.filters) : [];
      const byId = new Map<string, { row: ChunkRow; lexicalRank: number | null; semanticRank: number | null }>();
      for (const l of lex) byId.set(l.row.id, { row: l.row, lexicalRank: l.rank, semanticRank: null });
      for (const s of sem) {
        const e = byId.get(s.row.id);
        if (e) e.semanticRank = s.rank;
        else byId.set(s.row.id, { row: s.row, lexicalRank: null, semanticRank: s.rank });
      }
      const phraseRe = new RegExp(sq.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      for (const { row, lexicalRank, semanticRank } of byId.values()) {
        const rrf = (lexicalRank ? 1 / (RRF_K + lexicalRank) : 0) + (semanticRank ? 1 / (RRF_K + semanticRank) : 0);
        const authority = AUTHORITY_BOOST[row.authority_level] ?? 0;
        const modified = row.modified_at ?? row.published_at ?? row.fetched_at;
        const ageDays = Math.max(0, (now - new Date(modified).getTime()) / 86_400_000);
        const freshness = Number.isFinite(ageDays) ? Math.max(0, 0.1 - ageDays / 3650) : 0; // 0.1 for brand new → 0 at 10 years
        const phrase = phraseRe.test(row.text) ? 0.05 : 0;
        // RRF values are ~1/60; scale so explainable boosts are comparable but do not dominate.
        const score = rrf * 30 + authority + freshness + phrase;
        const existing = merged.get(row.id);
        if (existing && existing.score >= score) continue;
        merged.set(row.id, {
          chunkId: row.id, documentId: row.document_id, sourceId: row.source_id, locator: row.locator, documentTitle: row.title, headingPath: row.heading_path ?? '', text: row.text,
          charStart: row.char_start, charEnd: row.char_end, authorityLevel: row.authority_level, modifiedAt: row.modified_at, score,
          signals: { lexicalRank, semanticRank, rrf, authority, freshness, phrase }, subQuery: sq,
        });
      }
    }
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }
}

/** Human-readable citation for a hit: "Title › Heading (source, chars a–b)". */
export function formatCitation(hit: RetrievalHit): string {
  const where = [hit.documentTitle, hit.headingPath].filter(Boolean).join(' › ');
  return `${where || hit.locator} (${hit.locator}, chars ${hit.charStart}–${hit.charEnd})`;
}
