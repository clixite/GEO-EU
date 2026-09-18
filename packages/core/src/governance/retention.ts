import type { Database } from '../storage/database.ts';
import type { AuditLedger } from '../audit/ledger.ts';
import { retentionDaysFor, type PolicyDocument } from '../governance/policy.ts';
import { type Clock, systemClock } from '../shared/clock.ts';

/**
 * Data lifecycle: retention enforcement, tenant export (portability / Data Act
 * switching) and tenant erasure. The audit ledger is never pruned by this module
 * because pruning breaks the hash chain; archiving with re-anchoring is an
 * operator procedure (docs/OPERATIONS.md).
 */

export interface RetentionResult {
  modelCalls: number;
  observations: number;
  rejectedDrafts: number;
  cutoffs: Record<string, string>;
}

export function applyRetention(db: Database, ledger: AuditLedger, policy: PolicyDocument, ctx: { tenantId: string; actor: string }, clock: Clock = systemClock): RetentionResult {
  const now = clock.now().getTime();
  const cutoff = (objectType: string, fallback: number) => new Date(now - retentionDaysFor(policy, objectType, fallback) * 86_400_000).toISOString();
  const cutoffs = { model_call: cutoff('model_call', 365), observation: cutoff('observation', 730), draft: cutoff('draft', 1095) };
  const result = db.transaction(() => {
    const modelCalls = db.raw.prepare('DELETE FROM model_calls WHERE tenant_id = ? AND started_at < ?').run(ctx.tenantId, cutoffs.model_call).changes;
    const observations = db.raw.prepare('DELETE FROM observations WHERE tenant_id = ? AND observed_at < ?').run(ctx.tenantId, cutoffs.observation).changes;
    const rejectedDrafts = db.raw.prepare("DELETE FROM drafts WHERE tenant_id = ? AND status IN ('rejected', 'blocked') AND updated_at < ?").run(ctx.tenantId, cutoffs.draft).changes;
    return { modelCalls: Number(modelCalls), observations: Number(observations), rejectedDrafts: Number(rejectedDrafts), cutoffs };
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
  return out;
}

/** Erase all tenant data except the audit ledger, and record the erasure. */
export function eraseTenant(db: Database, ledger: AuditLedger, ctx: { tenantId: string; actor: string }, reason: string): Record<string, number> {
  const counts: Record<string, number> = {};
  db.transaction(() => {
    for (const table of TENANT_TABLES) {
      if (table === 'audit_events') continue;
      if (table === 'chunks') {
        const ids = db.raw.prepare('SELECT id FROM chunks WHERE tenant_id = ?').all(ctx.tenantId) as unknown as { id: string }[];
        const del = db.raw.prepare('DELETE FROM chunks_fts WHERE chunk_id = ?');
        for (const c of ids) del.run(c.id);
      }
      counts[table] = Number(db.raw.prepare(`DELETE FROM ${table} WHERE tenant_id = ?`).run(ctx.tenantId).changes);
    }
  });
  ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'tenant.erase', objectType: 'tenant', objectId: ctx.tenantId, evidence: { reason, counts } });
  return counts;
}
