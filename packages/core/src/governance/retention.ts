import type { Database } from '../storage/database.ts';
import type { AuditLedger } from '../audit/ledger.ts';
import { retentionDaysFor, type PolicyDocument } from '../governance/policy.ts';
import { type Clock, systemClock } from '../shared/clock.ts';

/**
 * Data lifecycle: retention enforcement, tenant export (portability / Data Act
 * switching) and tenant erasure. The audit ledger is never pruned by this module
 * because pruning breaks the hash chain; archiving with re-anchoring is an
 * operator procedure (docs/OPERATIONS.md). Ledger payloads are designed to carry
 * identifiers and hashes rather than free text (see docs/GDPR.md § ledger).
 */

export interface RetentionResult {
  modelCalls: number;
  observations: number;
  rejectedDrafts: number;
  approvals: number;
  expiredApprovals: number;
  /** Documents older than the document retention window — reported, never deleted automatically. */
  documentsPastRetention: number;
  cutoffs: Record<string, string>;
}

export const APPROVAL_VALIDITY_DAYS = 30;

export function applyRetention(db: Database, ledger: AuditLedger, policy: PolicyDocument, ctx: { tenantId: string; actor: string }, clock: Clock = systemClock): RetentionResult {
  const now = clock.now().getTime();
  const cutoff = (objectType: string, fallback: number) => new Date(now - retentionDaysFor(policy, objectType, fallback) * 86_400_000).toISOString();
  const cutoffs = { model_call: cutoff('model_call', 365), observation: cutoff('observation', 730), draft: cutoff('draft', 1095), approval: cutoff('approval', 3650), document: cutoff('document', 1825) };
  const approvalExpiry = new Date(now - APPROVAL_VALIDITY_DAYS * 86_400_000).toISOString();
  const result = db.transaction(() => {
    const modelCalls = Number(db.raw.prepare('DELETE FROM model_calls WHERE tenant_id = ? AND started_at < ?').run(ctx.tenantId, cutoffs.model_call).changes);
    const observations = Number(db.raw.prepare('DELETE FROM observations WHERE tenant_id = ? AND observed_at < ?').run(ctx.tenantId, cutoffs.observation).changes);
    const rejectedDrafts = Number(db.raw.prepare("DELETE FROM drafts WHERE tenant_id = ? AND status IN ('rejected', 'blocked') AND updated_at < ? AND id NOT IN (SELECT draft_id FROM publications)").run(ctx.tenantId, cutoffs.draft).changes);
    const expiredApprovals = Number(db.raw.prepare("UPDATE approvals SET status = 'expired' WHERE tenant_id = ? AND status IN ('pending', 'approved') AND requested_at < ?").run(ctx.tenantId, approvalExpiry).changes);
    const approvals = Number(db.raw.prepare("DELETE FROM approvals WHERE tenant_id = ? AND status <> 'pending' AND requested_at < ?").run(ctx.tenantId, cutoffs.approval).changes);
    const documentsPastRetention = (db.raw.prepare('SELECT COUNT(*) AS n FROM documents WHERE tenant_id = ? AND COALESCE(modified_at, published_at, fetched_at) < ?').get(ctx.tenantId, cutoffs.document) as unknown as { n: number }).n;
    return { modelCalls, observations, rejectedDrafts, approvals, expiredApprovals, documentsPastRetention, cutoffs };
  });
  ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'retention.apply', objectType: 'tenant', objectId: ctx.tenantId, policyId: policy.id, evidence: result });
  return result;
}

const TENANT_TABLES = ['sources', 'documents', 'chunks', 'claims', 'entities', 'ai_systems', 'model_registry', 'approvals', 'processing_records', 'drafts', 'publications', 'query_sets', 'observations', 'model_calls', 'audit_events'] as const;

/** Full tenant export as plain JSON (machine-readable, documented schema per table). */
export function exportTenant(db: Database, tenantId: string): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const table of TENANT_TABLES) {
    const rows = db.raw.prepare(`SELECT * FROM ${table} WHERE tenant_id = ?`).all(tenantId) as unknown as Record<string, unknown>[];
    out[table] = rows.map((r) => {
      const copy: Record<string, unknown> = { ...r };
      if (copy['embedding'] instanceof Uint8Array) copy['embedding'] = `<${(copy['embedding'] as Uint8Array).byteLength} bytes>`;
      return copy;
    });
  }
  out['entity_mentions'] = db.raw.prepare('SELECT m.* FROM entity_mentions m JOIN entities e ON e.id = m.entity_id WHERE e.tenant_id = ?').all(tenantId) as unknown as Record<string, unknown>[];
  return out;
}

/**
 * Erase all tenant data except the audit ledger, in dependency order so foreign
 * keys are honoured and the FTS index is cleared first (it does not cascade).
 */
export function eraseTenant(db: Database, ledger: AuditLedger, ctx: { tenantId: string; actor: string }, reason: string): Record<string, number> {
  const counts: Record<string, number> = {};
  db.transaction(() => {
    const t = ctx.tenantId;
    const del = (table: string, sql: string, ...params: string[]) => { counts[table] = Number(db.raw.prepare(sql).run(...params).changes); };
    del('chunks_fts', 'DELETE FROM chunks_fts WHERE tenant_id = ?', t);
    del('entity_mentions', 'DELETE FROM entity_mentions WHERE entity_id IN (SELECT id FROM entities WHERE tenant_id = ?)', t);
    del('claims', 'DELETE FROM claims WHERE tenant_id = ?', t);
    del('chunks', 'DELETE FROM chunks WHERE tenant_id = ?', t);
    del('documents', 'DELETE FROM documents WHERE tenant_id = ?', t);
    del('sources', 'DELETE FROM sources WHERE tenant_id = ?', t);
    del('entities', 'DELETE FROM entities WHERE tenant_id = ?', t);
    del('publications', 'DELETE FROM publications WHERE tenant_id = ?', t);
    del('drafts', 'DELETE FROM drafts WHERE tenant_id = ?', t);
    del('observations', 'DELETE FROM observations WHERE tenant_id = ?', t);
    del('query_sets', 'DELETE FROM query_sets WHERE tenant_id = ?', t);
    del('approvals', 'DELETE FROM approvals WHERE tenant_id = ?', t);
    del('processing_records', 'DELETE FROM processing_records WHERE tenant_id = ?', t);
    del('ai_systems', 'DELETE FROM ai_systems WHERE tenant_id = ?', t);
    del('model_registry', 'DELETE FROM model_registry WHERE tenant_id = ?', t);
    del('model_calls', 'DELETE FROM model_calls WHERE tenant_id = ?', t);
  });
  ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'tenant.erase', objectType: 'tenant', objectId: ctx.tenantId, evidence: { reason, counts } });
  return counts;
}
