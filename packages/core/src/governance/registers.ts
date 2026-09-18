import type { Database } from '../storage/database.ts';
import type { AuditLedger } from '../audit/ledger.ts';
import {
  AiSystemRecord,
  type AiSystemRecordInput,
  ModelRecord,
  type ModelRecordInput,
  ProcessingRecord,
  type ProcessingRecordInput,
} from './schemas.ts';
import { canonicalJson, newId } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';
import { notFound } from '../shared/errors.ts';

/**
 * Governance registers: AI system register (AI Act-style inventory), model registry
 * (provider/model records with data-policy metadata) and records of processing
 * (GDPR Art. 30 style). Every write is validated and audited with before/after state.
 */

interface Ctx {
  tenantId: string;
  actor: string;
  requestId?: string;
}

interface RegisterRow {
  id: string;
  record: string;
  created_at: string;
  updated_at: string;
}

export class ModelRegistry {
  readonly db: Database;
  readonly ledger: AuditLedger;
  readonly clock: Clock;

  constructor(db: Database, ledger: AuditLedger, clock: Clock = systemClock) {
    this.db = db;
    this.ledger = ledger;
    this.clock = clock;
  }

  upsert(ctx: Ctx, input: ModelRecordInput): { id: string; record: ModelRecord } {
    const record = ModelRecord.parse(input);
    const now = this.clock.now().toISOString();
    return this.db.transaction(() => {
      const existing = this.find(ctx.tenantId, record.provider, record.model);
      const id = existing?.id ?? newId();
      if (existing) {
        this.db.raw
          .prepare('UPDATE model_registry SET record = ?, updated_at = ? WHERE id = ?')
          .run(canonicalJson(record), now, id);
      } else {
        this.db.raw
          .prepare(
            'INSERT INTO model_registry (id, tenant_id, provider, model, record, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          )
          .run(id, ctx.tenantId, record.provider, record.model, canonicalJson(record), now, now);
      }
      this.ledger.append({
        tenantId: ctx.tenantId,
        actor: ctx.actor,
        action: existing ? 'model.update' : 'model.register',
        objectType: 'model',
        objectId: id,
        modelId: `${record.provider}/${record.model}`,
        ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
        ...(existing ? { previousState: existing.record } : {}),
        newState: record,
      });
      return { id, record };
    });
  }

  find(tenantId: string, provider: string, model: string): { id: string; record: ModelRecord } | undefined {
    const row = this.db.raw
      .prepare('SELECT id, record, created_at, updated_at FROM model_registry WHERE tenant_id = ? AND provider = ? AND model = ?')
      .get(tenantId, provider, model) as unknown as RegisterRow | undefined;
    return row ? { id: row.id, record: ModelRecord.parse(JSON.parse(row.record)) } : undefined;
  }

  get(tenantId: string, id: string): { id: string; record: ModelRecord } {
    const row = this.db.raw
      .prepare('SELECT id, record, created_at, updated_at FROM model_registry WHERE tenant_id = ? AND id = ?')
      .get(tenantId, id) as unknown as RegisterRow | undefined;
    if (!row) throw notFound('model', id);
    return { id: row.id, record: ModelRecord.parse(JSON.parse(row.record)) };
  }

  list(tenantId: string): { id: string; record: ModelRecord }[] {
    const rows = this.db.raw
      .prepare('SELECT id, record, created_at, updated_at FROM model_registry WHERE tenant_id = ? ORDER BY provider, model')
      .all(tenantId) as unknown as RegisterRow[];
    return rows.map((r) => ({ id: r.id, record: ModelRecord.parse(JSON.parse(r.record)) }));
  }

  setApprovalStatus(ctx: Ctx, id: string, status: ModelRecord['approvalStatus'], note?: string): ModelRecord {
    const current = this.get(ctx.tenantId, id);
    const next: ModelRecord = { ...current.record, approvalStatus: status };
    this.db.raw
      .prepare('UPDATE model_registry SET record = ?, updated_at = ? WHERE id = ?')
      .run(canonicalJson(next), this.clock.now().toISOString(), id);
    this.ledger.append({
      tenantId: ctx.tenantId,
      actor: ctx.actor,
      action: 'model.approval_status',
      objectType: 'model',
      objectId: id,
      modelId: `${next.provider}/${next.model}`,
      previousState: { approvalStatus: current.record.approvalStatus },
      newState: { approvalStatus: status },
      ...(note ? { evidence: { note } } : {}),
    });
    return next;
  }
}

export class AiSystemRegister {
  readonly db: Database;
  readonly ledger: AuditLedger;
  readonly clock: Clock;

  constructor(db: Database, ledger: AuditLedger, clock: Clock = systemClock) {
    this.db = db;
    this.ledger = ledger;
    this.clock = clock;
  }

  upsert(ctx: Ctx, input: AiSystemRecordInput): { id: string; record: AiSystemRecord } {
    const record = AiSystemRecord.parse(input);
    const now = this.clock.now().toISOString();
    return this.db.transaction(() => {
      const existing = this.findByName(ctx.tenantId, record.name);
      const id = existing?.id ?? newId();
      if (existing) {
        this.db.raw.prepare('UPDATE ai_systems SET record = ?, updated_at = ? WHERE id = ?').run(canonicalJson(record), now, id);
      } else {
        this.db.raw
          .prepare('INSERT INTO ai_systems (id, tenant_id, name, record, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(id, ctx.tenantId, record.name, canonicalJson(record), now, now);
      }
      this.ledger.append({
        tenantId: ctx.tenantId,
        actor: ctx.actor,
        action: existing ? 'ai_system.update' : 'ai_system.register',
        objectType: 'ai_system',
        objectId: id,
        ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
        ...(existing ? { previousState: existing.record } : {}),
        newState: record,
      });
      return { id, record };
    });
  }

  findByName(tenantId: string, name: string): { id: string; record: AiSystemRecord } | undefined {
    const row = this.db.raw
      .prepare('SELECT id, record, created_at, updated_at FROM ai_systems WHERE tenant_id = ? AND name = ?')
      .get(tenantId, name) as unknown as RegisterRow | undefined;
    return row ? { id: row.id, record: AiSystemRecord.parse(JSON.parse(row.record)) } : undefined;
  }

  list(tenantId: string): { id: string; record: AiSystemRecord }[] {
    const rows = this.db.raw
      .prepare('SELECT id, record, created_at, updated_at FROM ai_systems WHERE tenant_id = ? ORDER BY name')
      .all(tenantId) as unknown as RegisterRow[];
    return rows.map((r) => ({ id: r.id, record: AiSystemRecord.parse(JSON.parse(r.record)) }));
  }

  /** Systems whose review date has passed — surfaced on the governance dashboard. */
  overdueReviews(tenantId: string, asOf: Date = this.clock.now()): { id: string; record: AiSystemRecord }[] {
    return this.list(tenantId).filter((s) => new Date(s.record.reviewDate).getTime() < asOf.getTime());
  }
}

export class ProcessingRegister {
  readonly db: Database;
  readonly ledger: AuditLedger;
  readonly clock: Clock;

  constructor(db: Database, ledger: AuditLedger, clock: Clock = systemClock) {
    this.db = db;
    this.ledger = ledger;
    this.clock = clock;
  }

  create(ctx: Ctx, input: ProcessingRecordInput): { id: string; record: ProcessingRecord } {
    const record = ProcessingRecord.parse(input);
    const now = this.clock.now().toISOString();
    const id = newId();
    this.db.raw
      .prepare('INSERT INTO processing_records (id, tenant_id, record, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, ctx.tenantId, canonicalJson(record), now, now);
    this.ledger.append({
      tenantId: ctx.tenantId,
      actor: ctx.actor,
      action: 'processing_record.create',
      objectType: 'processing_record',
      objectId: id,
      newState: record,
    });
    return { id, record };
  }

  list(tenantId: string): { id: string; record: ProcessingRecord }[] {
    const rows = this.db.raw
      .prepare('SELECT id, record, created_at, updated_at FROM processing_records WHERE tenant_id = ? ORDER BY created_at')
      .all(tenantId) as unknown as RegisterRow[];
    return rows.map((r) => ({ id: r.id, record: ProcessingRecord.parse(JSON.parse(r.record)) }));
  }
}
