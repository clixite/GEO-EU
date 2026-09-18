import { z } from 'zod';
import type { Database } from '../storage/database.ts';
import type { AuditLedger } from '../audit/ledger.ts';
import { canonicalJson, newId, sha256 } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';
import { EvidentiaError, notFound } from '../shared/errors.ts';
import { extractHtml, extractText, type HeadingNode } from './html.ts';
import { chunkText } from './chunker.ts';
import { extractClaims } from './claims.ts';
import { extractEntities, resolveEntities } from './entities.ts';
import { scanForInjection } from '../security/injection.ts';

/**
 * Knowledge store: sources → documents (fingerprinted, versioned by content) →
 * chunks (FTS-indexed, optionally embedded) → claims and entities.
 *
 * Provenance is first-class: every chunk knows its document, offsets and heading
 * path; every claim knows its chunk; every document knows its source, fetch time and
 * fingerprint. Deletion cascades and is audited, and `redactTerm` supports GDPR
 * rectification/erasure across all derived artefacts.
 */

export const AuthorityLevel = z.enum(['official', 'internal', 'third-party', 'unverified']);
export type AuthorityLevel = z.infer<typeof AuthorityLevel>;

export const SourceInput = z.object({
  kind: z.enum(['url', 'file', 'manual', 'api']),
  locator: z.string().min(1),
  title: z.string().optional(),
  owner: z.string().optional(),
  authorityLevel: AuthorityLevel.default('internal'),
  licence: z.string().optional(),
  language: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});
export type SourceInput = z.input<typeof SourceInput>;

export interface SourceRecord {
  id: string;
  tenantId: string;
  kind: string;
  locator: string;
  title: string | null;
  owner: string | null;
  authorityLevel: AuthorityLevel;
  licence: string | null;
  language: string | null;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngestInput {
  sourceId: string;
  content: string;
  contentType?: 'text/html' | 'text/markdown' | 'text/plain';
  title?: string;
  fetchedAt?: string;
  publishedAt?: string;
  modifiedAt?: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestResult {
  status: 'ingested' | 'unchanged';
  documentId: string;
  fingerprint: string;
  chunks: number;
  claims: number;
  entities: number;
  embedded: boolean;
  quarantined: boolean;
  quarantineReason?: string[];
}

export interface DocumentRecord {
  id: string;
  tenantId: string;
  sourceId: string;
  fingerprint: string;
  title: string | null;
  contentType: string;
  language: string | null;
  fetchedAt: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  metadata: Record<string, unknown> | null;
  chunkCount: number;
}

interface Ctx {
  tenantId: string;
  actor: string;
  requestId?: string;
}

export type Embedder = (texts: string[]) => Promise<{ vectors: Float32Array[]; model: string }>;

const MAX_CONTENT_BYTES = 10 * 1024 * 1024;

export class KnowledgeStore {
  readonly db: Database;
  readonly ledger: AuditLedger;
  readonly clock: Clock;
  readonly embedder: Embedder | undefined;
  readonly claimConfidenceThreshold: number;

  constructor(db: Database, ledger: AuditLedger, options: { clock?: Clock; embedder?: Embedder; claimConfidenceThreshold?: number } = {}) {
    this.db = db;
    this.ledger = ledger;
    this.clock = options.clock ?? systemClock;
    this.embedder = options.embedder;
    this.claimConfidenceThreshold = options.claimConfidenceThreshold ?? 0.6;
  }

  addSource(ctx: Ctx, input: SourceInput): SourceRecord {
    const s = SourceInput.parse(input);
    const now = this.clock.now().toISOString();
    return this.db.transaction(() => {
      const existing = this.findSource(ctx.tenantId, s.locator);
      const id = existing?.id ?? newId();
      if (existing) {
        this.db.raw
          .prepare('UPDATE sources SET kind = ?, title = ?, owner = ?, authority_level = ?, licence = ?, language = ?, valid_from = ?, valid_until = ?, updated_at = ? WHERE id = ?')
          .run(s.kind, s.title ?? null, s.owner ?? null, s.authorityLevel, s.licence ?? null, s.language ?? null, s.validFrom ?? null, s.validUntil ?? null, now, id);
      } else {
        this.db.raw
          .prepare('INSERT INTO sources (id, tenant_id, kind, locator, title, owner, authority_level, licence, language, valid_from, valid_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, ctx.tenantId, s.kind, s.locator, s.title ?? null, s.owner ?? null, s.authorityLevel, s.licence ?? null, s.language ?? null, s.validFrom ?? null, s.validUntil ?? null, now, now);
      }
      this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: existing ? 'source.update' : 'source.add', objectType: 'source', objectId: id, ...(ctx.requestId ? { requestId: ctx.requestId } : {}), ...(existing ? { previousState: existing } : {}), newState: s });
      return this.getSource(ctx.tenantId, id);
    });
  }

  findSource(tenantId: string, locator: string): SourceRecord | undefined {
    const row = this.db.raw.prepare('SELECT * FROM sources WHERE tenant_id = ? AND locator = ?').get(tenantId, locator) as unknown as Record<string, string | null> | undefined;
    return row ? sourceFromRow(row) : undefined;
  }

  getSource(tenantId: string, id: string): SourceRecord {
    const row = this.db.raw.prepare('SELECT * FROM sources WHERE tenant_id = ? AND id = ?').get(tenantId, id) as unknown as Record<string, string | null> | undefined;
    if (!row) throw notFound('source', id);
    return sourceFromRow(row);
  }

  listSources(tenantId: string): SourceRecord[] {
    return (this.db.raw.prepare('SELECT * FROM sources WHERE tenant_id = ? ORDER BY created_at').all(tenantId) as unknown as Record<string, string | null>[]).map(sourceFromRow);
  }

  async ingest(ctx: Ctx, input: IngestInput): Promise<IngestResult> {
    if (Buffer.byteLength(input.content, 'utf8') > MAX_CONTENT_BYTES) {
      throw new EvidentiaError('validation', `content exceeds ${MAX_CONTENT_BYTES} bytes`);
    }
    const source = this.getSource(ctx.tenantId, input.sourceId);
    const fingerprint = sha256(input.content);
    const existing = this.db.raw.prepare('SELECT id FROM documents WHERE tenant_id = ? AND source_id = ? AND fingerprint = ?').get(ctx.tenantId, source.id, fingerprint) as unknown as { id: string } | undefined;
    if (existing) {
      const counts = this.documentCounts(existing.id);
      return { status: 'unchanged', documentId: existing.id, fingerprint, ...counts, embedded: counts.embedded, quarantined: false };
    }

    const contentType = input.contentType ?? (/<\s*(html|body|div|p|h1)\b/i.test(input.content) ? 'text/html' : 'text/plain');
    let text: string;
    let headings: HeadingNode[];
    let title = input.title ?? null;
    let publishedAt = input.publishedAt ?? null;
    let modifiedAt = input.modifiedAt ?? null;
    let language = input.language ?? source.language ?? null;
    if (contentType === 'text/html') {
      const page = extractHtml(input.content);
      text = page.text;
      headings = page.headings;
      title ??= page.title;
      publishedAt ??= page.dates.published;
      modifiedAt ??= page.dates.modified;
      language ??= page.lang;
    } else {
      const r = extractText(input.content);
      text = r.text;
      headings = r.headings;
      title ??= headings[0]?.text ?? null;
    }
    const chunks = chunkText(text, headings);
    // Poisoned-document defence: instruction-like strings quarantine the document
    // (excluded from retrieval until a reviewer releases it).
    const injection = scanForInjection(text);
    const quarantine = injection.some((f) => f.severity === 'high');
    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}), ...(quarantine ? { quarantine: true, quarantineReason: injection.map((f) => f.id) } : {}) };
    let vectors: Float32Array[] | null = null;
    let embeddingModel: string | null = null;
    if (this.embedder && chunks.length) {
      const r = await this.embedder(chunks.map((c) => c.text));
      vectors = r.vectors;
      embeddingModel = r.model;
    }

    const now = this.clock.now().toISOString();
    const documentId = newId();
    let claimCount = 0;
    const entityCanon = new Set<string>();
    this.db.transaction(() => {
      // Previous versions of the same document (same source) are superseded: remove them.
      const old = this.db.raw.prepare('SELECT id FROM documents WHERE tenant_id = ? AND source_id = ?').all(ctx.tenantId, source.id) as unknown as { id: string }[];
      for (const o of old) this.#deleteDocumentRows(o.id);

      this.db.raw
        .prepare('INSERT INTO documents (id, tenant_id, source_id, fingerprint, title, content, content_type, language, fetched_at, published_at, modified_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(documentId, ctx.tenantId, source.id, fingerprint, title, text, contentType, language, input.fetchedAt ?? now, publishedAt, modifiedAt, Object.keys(metadata).length ? canonicalJson(metadata) : null);
      const insChunk = this.db.raw.prepare('INSERT INTO chunks (id, tenant_id, document_id, ordinal, heading_path, text, char_start, char_end, token_estimate, embedding, embedding_model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insFts = this.db.raw.prepare('INSERT INTO chunks_fts (text, heading_path, chunk_id, tenant_id) VALUES (?, ?, ?, ?)');
      const insClaim = this.db.raw.prepare('INSERT INTO claims (id, tenant_id, chunk_id, document_id, text, kind, confidence, entities, valid_from, valid_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const insEntity = this.db.raw.prepare('INSERT OR IGNORE INTO entities (id, tenant_id, canonical_name, kind, aliases, same_as, description, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)');
      const selEntity = this.db.raw.prepare('SELECT id, aliases FROM entities WHERE tenant_id = ? AND canonical_name = ? AND kind = ?');
      const updAliases = this.db.raw.prepare('UPDATE entities SET aliases = ? WHERE id = ?');
      const insMention = this.db.raw.prepare('INSERT OR IGNORE INTO entity_mentions (entity_id, chunk_id, surface) VALUES (?, ?, ?)');

      chunks.forEach((c, i) => {
        const chunkId = newId();
        const vec = vectors?.[i];
        insChunk.run(chunkId, ctx.tenantId, documentId, c.ordinal, c.headingPath, c.text, c.charStart, c.charEnd, c.tokenEstimate, vec ? Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength) : null, embeddingModel);
        insFts.run(c.text, c.headingPath, chunkId, ctx.tenantId);
        // Quarantined content is never mined for claims or entities: a poisoned document's
        // "facts" and "entities" would otherwise reach the knowledge base — and downstream
        // drafting/retrieval — even though its chunks are excluded from search. Extraction
        // runs retroactively in setQuarantine() when a reviewer releases the document.
        if (quarantine) return;
        const mentions = extractEntities(c.text);
        const resolved = resolveEntities(mentions, 0.5);
        const entityNames = resolved.map((e) => e.canonical);
        for (const c2 of extractClaims(c.text)) {
          if (c2.confidence < this.claimConfidenceThreshold) continue;
          const involved = entityNames.filter((n) => c2.text.toLowerCase().includes(n));
          insClaim.run(newId(), ctx.tenantId, chunkId, documentId, c2.text, c2.kind, c2.confidence, involved.length ? JSON.stringify(involved) : null, source.validFrom ?? null, source.validUntil ?? null, now);
          claimCount += 1;
        }
        for (const e of resolved) {
          insEntity.run(newId(), ctx.tenantId, e.canonical, e.kind, JSON.stringify(e.surfaces), now);
          const row = selEntity.get(ctx.tenantId, e.canonical, e.kind) as unknown as { id: string; aliases: string | null };
          const aliases = new Set<string>([...(row.aliases ? (JSON.parse(row.aliases) as string[]) : []), ...e.surfaces]);
          updAliases.run(JSON.stringify([...aliases]), row.id);
          for (const s of e.surfaces) insMention.run(row.id, chunkId, s);
          entityCanon.add(e.canonical);
        }
      });
      this.ledger.append({
        tenantId: ctx.tenantId, actor: ctx.actor, action: 'document.ingest', objectType: 'document', objectId: documentId, ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
        newState: { sourceId: source.id, fingerprint, title, contentType, chunks: chunks.length, claims: claimCount, entities: entityCanon.size, embedded: vectors !== null, supersededVersions: old.length, quarantine },
        ...(quarantine ? { evidence: { injection: injection.map((f) => ({ id: f.id, severity: f.severity })) } } : {}),
      });
    });
    return { status: 'ingested', documentId, fingerprint, chunks: chunks.length, claims: claimCount, entities: entityCanon.size, embedded: vectors !== null, quarantined: quarantine, ...(quarantine ? { quarantineReason: injection.map((f) => f.id) } : {}) };
  }

  documentCounts(documentId: string): { chunks: number; claims: number; entities: number; embedded: boolean } {
    const chunks = (this.db.raw.prepare('SELECT COUNT(*) AS n, SUM(embedding IS NOT NULL) AS e FROM chunks WHERE document_id = ?').get(documentId) as unknown as { n: number; e: number | null });
    const claims = (this.db.raw.prepare('SELECT COUNT(*) AS n FROM claims WHERE document_id = ?').get(documentId) as unknown as { n: number }).n;
    const entities = (this.db.raw.prepare('SELECT COUNT(DISTINCT entity_id) AS n FROM entity_mentions m JOIN chunks c ON c.id = m.chunk_id WHERE c.document_id = ?').get(documentId) as unknown as { n: number }).n;
    return { chunks: chunks.n, claims, entities, embedded: (chunks.e ?? 0) > 0 && chunks.e === chunks.n };
  }

  listDocuments(tenantId: string, sourceId?: string): DocumentRecord[] {
    const rows = (sourceId
      ? this.db.raw.prepare('SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count FROM documents d WHERE tenant_id = ? AND source_id = ? ORDER BY fetched_at DESC').all(tenantId, sourceId)
      : this.db.raw.prepare('SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count FROM documents d WHERE tenant_id = ? ORDER BY fetched_at DESC').all(tenantId)) as unknown as Record<string, unknown>[];
    return rows.map(documentFromRow);
  }

  getDocument(tenantId: string, id: string): DocumentRecord & { content: string } {
    const row = this.db.raw.prepare('SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count FROM documents d WHERE tenant_id = ? AND id = ?').get(tenantId, id) as unknown as Record<string, unknown> | undefined;
    if (!row) throw notFound('document', id);
    return { ...documentFromRow(row), content: String(row['content']) };
  }

  /** Documents whose last known modification is older than `maxAgeDays` — freshness worklist. */
  staleDocuments(tenantId: string, maxAgeDays: number): DocumentRecord[] {
    const cutoff = new Date(this.clock.now().getTime() - maxAgeDays * 86_400_000).toISOString();
    return this.listDocuments(tenantId).filter((d) => (d.modifiedAt ?? d.publishedAt ?? d.fetchedAt) < cutoff);
  }

  listClaims(tenantId: string, documentId?: string): { id: string; documentId: string; chunkId: string; text: string; kind: string; confidence: number; entities: string[] }[] {
    const rows = (documentId
      ? this.db.raw.prepare('SELECT * FROM claims WHERE tenant_id = ? AND document_id = ? ORDER BY confidence DESC').all(tenantId, documentId)
      : this.db.raw.prepare('SELECT * FROM claims WHERE tenant_id = ? ORDER BY confidence DESC').all(tenantId)) as unknown as Record<string, unknown>[];
    return rows.map((r) => ({ id: String(r['id']), documentId: String(r['document_id']), chunkId: String(r['chunk_id']), text: String(r['text']), kind: String(r['kind']), confidence: Number(r['confidence']), entities: r['entities'] ? (JSON.parse(String(r['entities'])) as string[]) : [] }));
  }

  listEntities(tenantId: string): { id: string; canonical: string; kind: string; aliases: string[]; mentions: number }[] {
    const rows = this.db.raw.prepare('SELECT e.id, e.canonical_name, e.kind, e.aliases, (SELECT COUNT(*) FROM entity_mentions m WHERE m.entity_id = e.id) AS mentions FROM entities e WHERE tenant_id = ? ORDER BY mentions DESC').all(tenantId) as unknown as Record<string, unknown>[];
    return rows.map((r) => ({ id: String(r['id']), canonical: String(r['canonical_name']), kind: String(r['kind']), aliases: r['aliases'] ? (JSON.parse(String(r['aliases'])) as string[]) : [], mentions: Number(r['mentions']) }));
  }

  deleteSource(ctx: Ctx, id: string, reason: string): void {
    const source = this.getSource(ctx.tenantId, id);
    this.db.transaction(() => {
      const docs = this.db.raw.prepare('SELECT id FROM documents WHERE source_id = ?').all(id) as unknown as { id: string }[];
      for (const d of docs) this.#deleteDocumentRows(d.id);
      this.db.raw.prepare('DELETE FROM sources WHERE id = ?').run(id);
      this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'source.delete', objectType: 'source', objectId: id, previousState: source, evidence: { reason, documentsDeleted: docs.length } });
    });
  }

  /**
   * Find every chunk (text or heading), claim, document title, source field and
   * entity alias containing `term` (case-insensitive). Supports data-subject
   * access requests: "what do you hold about X?" — every location redactTerm can
   * reach is also a location findTerm reports, so a DSAR answer and the erasure
   * it justifies cover the same ground.
   */
  findTerm(tenantId: string, term: string): {
    chunks: { id: string; documentId: string; snippet: string }[];
    claims: { id: string; text: string }[];
    entities: { id: string; canonical: string }[];
    documents: { id: string; field: 'title' }[];
    sources: { id: string; field: 'title' | 'owner' }[];
  } {
    const like = `%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
    const chunkRows = this.db.raw.prepare("SELECT id, document_id, text, heading_path FROM chunks WHERE tenant_id = ? AND (text LIKE ? ESCAPE '\\' OR heading_path LIKE ? ESCAPE '\\')").all(tenantId, like, like) as unknown as { id: string; document_id: string; text: string; heading_path: string | null }[];
    const chunks = chunkRows.map((r) => {
      const hay = r.text.toLowerCase().includes(term.toLowerCase()) ? r.text : (r.heading_path ?? '');
      const i = hay.toLowerCase().indexOf(term.toLowerCase());
      return { id: r.id, documentId: r.document_id, snippet: i === -1 ? hay : hay.slice(Math.max(0, i - 60), i + term.length + 60) };
    });
    const claims = this.db.raw.prepare("SELECT id, text FROM claims WHERE tenant_id = ? AND text LIKE ? ESCAPE '\\'").all(tenantId, like) as unknown as { id: string; text: string }[];
    const entities = (this.db.raw.prepare("SELECT id, canonical_name FROM entities WHERE tenant_id = ? AND (canonical_name LIKE ? ESCAPE '\\' OR aliases LIKE ? ESCAPE '\\')").all(tenantId, like, like) as unknown as { id: string; canonical_name: string }[]).map((r) => ({ id: r.id, canonical: r.canonical_name }));
    const documents = (this.db.raw.prepare("SELECT id FROM documents WHERE tenant_id = ? AND title LIKE ? ESCAPE '\\'").all(tenantId, like) as unknown as { id: string }[]).map((r) => ({ id: r.id, field: 'title' as const }));
    const sources = (this.db.raw.prepare("SELECT id, title, owner FROM sources WHERE tenant_id = ? AND (title LIKE ? ESCAPE '\\' OR owner LIKE ? ESCAPE '\\')").all(tenantId, like, like) as unknown as { id: string; title: string | null; owner: string | null }[])
      .map((r) => ({ id: r.id, field: (r.owner ?? '').toLowerCase().includes(term.toLowerCase()) ? ('owner' as const) : ('title' as const) }));
    return { chunks, claims, entities, documents, sources };
  }

  /**
   * Rectification / erasure: replace `term` everywhere it can appear (chunk text,
   * chunk heading paths and their FTS mirror, document content and title, source
   * title and owner, claim text, entity aliases), and remove entities whose
   * canonical name matches. Audited with counts only (never the term itself in
   * clear text when `reason` marks it as personal data).
   *
   * Not covered here — documented residual scope, not silently dropped:
   * `approvals.requested_by/decided_by` and `entities.canonical_name` (actor and
   * entity identifiers, not free text a name search is expected to reach) and the
   * append-only audit ledger, whose payloads are designed to carry hashes and ids
   * rather than free text for exactly this reason (see docs/GDPR.md § ledger).
   */
  redactTerm(ctx: Ctx, term: string, replacement: string, reason: string): { chunks: number; claims: number; entities: number; documents: number; sources: number } {
    if (term.length < 2) throw new EvidentiaError('validation', 'term too short');
    const found = this.findTerm(ctx.tenantId, term);
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return this.db.transaction(() => {
      const docIds = new Set<string>();
      const updChunk = this.db.raw.prepare('UPDATE chunks SET text = ?, heading_path = ? WHERE id = ?');
      const delFts = this.db.raw.prepare('DELETE FROM chunks_fts WHERE chunk_id = ?');
      const insFts = this.db.raw.prepare('INSERT INTO chunks_fts (text, heading_path, chunk_id, tenant_id) VALUES (?, ?, ?, ?)');
      for (const c of found.chunks) {
        const row = this.db.raw.prepare('SELECT text, heading_path FROM chunks WHERE id = ?').get(c.id) as unknown as { text: string; heading_path: string | null };
        const text = row.text.replace(re, replacement);
        const headingPath = (row.heading_path ?? '').replace(re, replacement);
        updChunk.run(text, headingPath, c.id);
        delFts.run(c.id);
        insFts.run(text, headingPath, c.id, ctx.tenantId);
        docIds.add(c.documentId);
      }
      const updClaim = this.db.raw.prepare('UPDATE claims SET text = ? WHERE id = ?');
      for (const cl of found.claims) updClaim.run(cl.text.replace(re, replacement), cl.id);
      for (const d of found.documents) docIds.add(d.id);
      for (const d of docIds) {
        const row = this.db.raw.prepare('SELECT content, title FROM documents WHERE id = ?').get(d) as unknown as { content: string; title: string | null };
        this.db.raw.prepare('UPDATE documents SET content = ?, title = ? WHERE id = ?').run(row.content.replace(re, replacement), row.title ? row.title.replace(re, replacement) : row.title, d);
      }
      const updSource = this.db.raw.prepare('UPDATE sources SET title = ?, owner = ? WHERE id = ?');
      for (const s of found.sources) {
        const row = this.db.raw.prepare('SELECT title, owner FROM sources WHERE id = ?').get(s.id) as unknown as { title: string | null; owner: string | null };
        updSource.run(row.title ? row.title.replace(re, replacement) : row.title, row.owner ? row.owner.replace(re, replacement) : row.owner, s.id);
      }
      const delEntity = this.db.raw.prepare('DELETE FROM entities WHERE id = ?');
      for (const e of found.entities) delEntity.run(e.id);
      const result = { chunks: found.chunks.length, claims: found.claims.length, entities: found.entities.length, documents: docIds.size, sources: found.sources.length };
      this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'knowledge.redact', objectType: 'tenant', objectId: ctx.tenantId, evidence: { reason, termHash: sha256(term), ...result } });
      return result;
    });
  }

  /**
   * Reviewer decision to release (or re-quarantine) a document after inspecting the
   * injection findings. Releasing a document that was quarantined at ingest time
   * (so never mined for claims/entities) extracts them now, on the reviewer's
   * decision rather than automatically; re-quarantining removes them again.
   */
  setQuarantine(ctx: Ctx, documentId: string, quarantine: boolean, note: string): void {
    const doc = this.getDocument(ctx.tenantId, documentId);
    const wasQuarantined = doc.metadata?.['quarantine'] === true;
    const metadata = { ...(doc.metadata ?? {}), quarantine, quarantineNote: note };
    let claimCount = 0;
    let entityCount = 0;
    this.db.transaction(() => {
      this.db.raw.prepare('UPDATE documents SET metadata = ? WHERE id = ?').run(canonicalJson(metadata), documentId);
      if (!quarantine && wasQuarantined) {
        const counts = this.#extractClaimsAndEntities(ctx.tenantId, documentId, doc.sourceId);
        claimCount = counts.claims;
        entityCount = counts.entities;
      } else if (quarantine && !wasQuarantined) {
        this.db.raw.prepare('DELETE FROM claims WHERE document_id = ?').run(documentId);
        this.db.raw.prepare('DELETE FROM entity_mentions WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?)').run(documentId);
        this.db.raw.prepare('DELETE FROM entities WHERE tenant_id = ? AND id NOT IN (SELECT DISTINCT entity_id FROM entity_mentions)').run(ctx.tenantId);
      }
    });
    this.ledger.append({
      tenantId: ctx.tenantId, actor: ctx.actor, action: quarantine ? 'document.quarantine' : 'document.release', objectType: 'document', objectId: documentId,
      previousState: { quarantine: wasQuarantined }, newState: { quarantine }, evidence: { note, ...(claimCount || entityCount ? { extractedClaims: claimCount, extractedEntities: entityCount } : {}) },
    });
  }

  /**
   * Claim/entity extraction over a document's existing chunks. Used both when a
   * quarantined document is released (extraction was skipped at ingest) and could
   * be reused for backfilling older documents. Idempotent: clears any prior claims
   * for the document first, so calling it twice does not duplicate rows.
   */
  #extractClaimsAndEntities(tenantId: string, documentId: string, sourceId: string): { claims: number; entities: number } {
    const source = this.getSource(tenantId, sourceId);
    const now = this.clock.now().toISOString();
    const chunks = this.db.raw.prepare('SELECT id, text FROM chunks WHERE document_id = ?').all(documentId) as unknown as { id: string; text: string }[];
    this.db.raw.prepare('DELETE FROM claims WHERE document_id = ?').run(documentId);
    const insClaim = this.db.raw.prepare('INSERT INTO claims (id, tenant_id, chunk_id, document_id, text, kind, confidence, entities, valid_from, valid_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insEntity = this.db.raw.prepare('INSERT OR IGNORE INTO entities (id, tenant_id, canonical_name, kind, aliases, same_as, description, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)');
    const selEntity = this.db.raw.prepare('SELECT id, aliases FROM entities WHERE tenant_id = ? AND canonical_name = ? AND kind = ?');
    const updAliases = this.db.raw.prepare('UPDATE entities SET aliases = ? WHERE id = ?');
    const insMention = this.db.raw.prepare('INSERT OR IGNORE INTO entity_mentions (entity_id, chunk_id, surface) VALUES (?, ?, ?)');
    let claimCount = 0;
    const entityCanon = new Set<string>();
    for (const c of chunks) {
      const mentions = extractEntities(c.text);
      const resolved = resolveEntities(mentions, 0.5);
      const entityNames = resolved.map((e) => e.canonical);
      for (const c2 of extractClaims(c.text)) {
        if (c2.confidence < this.claimConfidenceThreshold) continue;
        const involved = entityNames.filter((n) => c2.text.toLowerCase().includes(n));
        insClaim.run(newId(), tenantId, c.id, documentId, c2.text, c2.kind, c2.confidence, involved.length ? JSON.stringify(involved) : null, source.validFrom ?? null, source.validUntil ?? null, now);
        claimCount += 1;
      }
      for (const e of resolved) {
        insEntity.run(newId(), tenantId, e.canonical, e.kind, JSON.stringify(e.surfaces), now);
        const row = selEntity.get(tenantId, e.canonical, e.kind) as unknown as { id: string; aliases: string | null };
        const aliases = new Set<string>([...(row.aliases ? (JSON.parse(row.aliases) as string[]) : []), ...e.surfaces]);
        updAliases.run(JSON.stringify([...aliases]), row.id);
        for (const s of e.surfaces) insMention.run(row.id, c.id, s);
        entityCanon.add(e.canonical);
      }
    }
    return { claims: claimCount, entities: entityCanon.size };
  }

  /** Documents currently quarantined — the reviewer worklist. */
  quarantined(tenantId: string): DocumentRecord[] {
    return this.listDocuments(tenantId).filter((d) => d.metadata?.['quarantine'] === true);
  }

  stats(tenantId: string): { sources: number; documents: number; chunks: number; claims: number; entities: number; embeddedChunks: number } {
    const one = (sql: string) => (this.db.raw.prepare(sql).get(tenantId) as unknown as { n: number }).n;
    return {
      sources: one('SELECT COUNT(*) AS n FROM sources WHERE tenant_id = ?'),
      documents: one('SELECT COUNT(*) AS n FROM documents WHERE tenant_id = ?'),
      chunks: one('SELECT COUNT(*) AS n FROM chunks WHERE tenant_id = ?'),
      claims: one('SELECT COUNT(*) AS n FROM claims WHERE tenant_id = ?'),
      entities: one('SELECT COUNT(*) AS n FROM entities WHERE tenant_id = ?'),
      embeddedChunks: one('SELECT COUNT(*) AS n FROM chunks WHERE tenant_id = ? AND embedding IS NOT NULL'),
    };
  }

  #deleteDocumentRows(documentId: string): void {
    const chunks = this.db.raw.prepare('SELECT id FROM chunks WHERE document_id = ?').all(documentId) as unknown as { id: string }[];
    const delFts = this.db.raw.prepare('DELETE FROM chunks_fts WHERE chunk_id = ?');
    for (const c of chunks) delFts.run(c.id);
    this.db.raw.prepare('DELETE FROM documents WHERE id = ?').run(documentId); // cascades chunks, claims, mentions
    this.db.raw.prepare('DELETE FROM entities WHERE id NOT IN (SELECT DISTINCT entity_id FROM entity_mentions)').run();
  }
}

function sourceFromRow(r: Record<string, string | null>): SourceRecord {
  return {
    id: String(r['id']), tenantId: String(r['tenant_id']), kind: String(r['kind']), locator: String(r['locator']), title: r['title'] ?? null, owner: r['owner'] ?? null,
    authorityLevel: AuthorityLevel.parse(r['authority_level']), licence: r['licence'] ?? null, language: r['language'] ?? null, validFrom: r['valid_from'] ?? null, validUntil: r['valid_until'] ?? null,
    createdAt: String(r['created_at']), updatedAt: String(r['updated_at']),
  };
}

function documentFromRow(r: Record<string, unknown>): DocumentRecord {
  return {
    id: String(r['id']), tenantId: String(r['tenant_id']), sourceId: String(r['source_id']), fingerprint: String(r['fingerprint']), title: (r['title'] as string | null) ?? null, contentType: String(r['content_type']),
    language: (r['language'] as string | null) ?? null, fetchedAt: String(r['fetched_at']), publishedAt: (r['published_at'] as string | null) ?? null, modifiedAt: (r['modified_at'] as string | null) ?? null,
    metadata: r['metadata'] ? (JSON.parse(String(r['metadata'])) as Record<string, unknown>) : null, chunkCount: Number(r['chunk_count'] ?? 0),
  };
}
