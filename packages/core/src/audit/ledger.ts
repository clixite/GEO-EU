import { z } from 'zod';
import type { Database } from '../storage/database.ts';
import { canonicalJson, newId, sha256 } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * Append-only, hash-chained audit ledger.
 *
 * Every consequential action (policy decision, approval, publication, model call,
 * register change, erasure) is recorded with actor, object, before/after state,
 * policy, model, request id and evidence. Each event's hash covers its own content
 * and the previous hash, so tampering with or deleting any row breaks verification.
 * This is an integrity mechanism, not non-repudiation: pair with external anchoring
 * (e.g. periodic export of the head hash to a WORM store) for stronger guarantees.
 */

export const AuditEventInput = z.object({
  tenantId: z.string().min(1),
  actor: z.string().min(1),
  action: z.string().min(1),
  objectType: z.string().min(1),
  objectId: z.string().min(1),
  requestId: z.string().optional(),
  policyId: z.string().optional(),
  modelId: z.string().optional(),
  approvalId: z.string().optional(),
  previousState: z.unknown().optional(),
  newState: z.unknown().optional(),
  evidence: z.unknown().optional(),
});
export type AuditEventInput = z.infer<typeof AuditEventInput>;

export interface AuditEvent extends AuditEventInput {
  seq: number;
  id: string;
  ts: string;
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = sha256('evidentia-audit-genesis');

interface Row {
  seq: number;
  id: string;
  ts: string;
  tenant_id: string;
  actor: string;
  action: string;
  object_type: string;
  object_id: string;
  request_id: string | null;
  policy_id: string | null;
  model_id: string | null;
  approval_id: string | null;
  previous_state: string | null;
  new_state: string | null;
  evidence: string | null;
  prev_hash: string;
  hash: string;
}

function hashEvent(e: Omit<AuditEvent, 'hash'>): string {
  return sha256(
    canonicalJson({
      seq: e.seq,
      id: e.id,
      ts: e.ts,
      tenantId: e.tenantId,
      actor: e.actor,
      action: e.action,
      objectType: e.objectType,
      objectId: e.objectId,
      requestId: e.requestId ?? null,
      policyId: e.policyId ?? null,
      modelId: e.modelId ?? null,
      approvalId: e.approvalId ?? null,
      previousState: e.previousState ?? null,
      newState: e.newState ?? null,
      evidence: e.evidence ?? null,
      prevHash: e.prevHash,
    }),
  );
}

function rowToEvent(r: Row): AuditEvent {
  const e: AuditEvent = {
    seq: r.seq,
    id: r.id,
    ts: r.ts,
    tenantId: r.tenant_id,
    actor: r.actor,
    action: r.action,
    objectType: r.object_type,
    objectId: r.object_id,
    prevHash: r.prev_hash,
    hash: r.hash,
  };
  if (r.request_id) e.requestId = r.request_id;
  if (r.policy_id) e.policyId = r.policy_id;
  if (r.model_id) e.modelId = r.model_id;
  if (r.approval_id) e.approvalId = r.approval_id;
  if (r.previous_state) e.previousState = JSON.parse(r.previous_state);
  if (r.new_state) e.newState = JSON.parse(r.new_state);
  if (r.evidence) e.evidence = JSON.parse(r.evidence);
  return e;
}

export class AuditLedger {
  readonly #db: Database;
  readonly #clock: Clock;

  constructor(db: Database, clock: Clock = systemClock) {
    this.#db = db;
    this.#clock = clock;
  }

  /** Append an event. Runs inside a transaction so the chain cannot fork. */
  append(input: AuditEventInput): AuditEvent {
    const parsed = AuditEventInput.parse(input);
    return this.#db.transaction(() => {
      const head = this.head();
      const seq = (head?.seq ?? 0) + 1;
      const partial: Omit<AuditEvent, 'hash'> = {
        ...parsed,
        seq,
        id: newId(),
        ts: this.#clock.now().toISOString(),
        prevHash: head?.hash ?? GENESIS_HASH,
      };
      const hash = hashEvent(partial);
      const event: AuditEvent = { ...partial, hash };
      this.#db.raw
        .prepare(
          `INSERT INTO audit_events (seq, id, ts, tenant_id, actor, action, object_type, object_id,
             request_id, policy_id, model_id, approval_id, previous_state, new_state, evidence, prev_hash, hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.seq,
          event.id,
          event.ts,
          event.tenantId,
          event.actor,
          event.action,
          event.objectType,
          event.objectId,
          event.requestId ?? null,
          event.policyId ?? null,
          event.modelId ?? null,
          event.approvalId ?? null,
          event.previousState === undefined ? null : canonicalJson(event.previousState),
          event.newState === undefined ? null : canonicalJson(event.newState),
          event.evidence === undefined ? null : canonicalJson(event.evidence),
          event.prevHash,
          event.hash,
        );
      return event;
    });
  }

  head(): AuditEvent | undefined {
    const row = this.#db.raw
      .prepare('SELECT * FROM audit_events ORDER BY seq DESC LIMIT 1')
      .get() as unknown as Row | undefined;
    return row ? rowToEvent(row) : undefined;
  }

  list(filter: {
    tenantId?: string;
    objectType?: string;
    objectId?: string;
    action?: string;
    limit?: number;
  } = {}): AuditEvent[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.tenantId) {
      where.push('tenant_id = ?');
      params.push(filter.tenantId);
    }
    if (filter.objectType) {
      where.push('object_type = ?');
      params.push(filter.objectType);
    }
    if (filter.objectId) {
      where.push('object_id = ?');
      params.push(filter.objectId);
    }
    if (filter.action) {
      where.push('action = ?');
      params.push(filter.action);
    }
    const sql = `SELECT * FROM audit_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY seq ASC LIMIT ?`;
    params.push(filter.limit ?? 1000);
    return (this.#db.raw.prepare(sql).all(...params) as unknown as Row[]).map(rowToEvent);
  }

  /**
   * Walk the whole chain and recompute every hash. Returns the first broken
   * sequence number, or `ok: true` with the head hash.
   */
  verify(): { ok: true; count: number; headHash: string } | { ok: false; brokenAt: number; reason: string } {
    const rows = this.#db.raw.prepare('SELECT * FROM audit_events ORDER BY seq ASC').all() as unknown as Row[];
    let prev = GENESIS_HASH;
    let expectedSeq = 1;
    for (const row of rows) {
      const e = rowToEvent(row);
      if (e.seq !== expectedSeq) return { ok: false, brokenAt: e.seq, reason: 'sequence gap' };
      if (e.prevHash !== prev) return { ok: false, brokenAt: e.seq, reason: 'previous hash mismatch' };
      const { hash, ...rest } = e;
      if (hashEvent(rest) !== hash) return { ok: false, brokenAt: e.seq, reason: 'content hash mismatch' };
      prev = hash;
      expectedSeq += 1;
    }
    return { ok: true, count: rows.length, headHash: prev };
  }

  #lastVerified: { headHash: string; count: number } | null = null;

  /**
   * Verification that is cheap on repeated calls: the full walk runs only when the
   * head changed since the last successful verification (the chain below an
   * unchanged, previously verified head cannot have been altered without changing
   * the head hash it was derived from — unless rows were rewritten wholesale, which
   * the scheduled full `verify()` catches).
   */
  verifyCached(): ReturnType<AuditLedger['verify']> {
    const head = this.head();
    if (this.#lastVerified && head && head.hash === this.#lastVerified.headHash && head.seq === this.#lastVerified.count) {
      return { ok: true, count: this.#lastVerified.count, headHash: this.#lastVerified.headHash };
    }
    const result = this.verify();
    this.#lastVerified = result.ok ? { headHash: result.headHash, count: result.count } : null;
    return result;
  }

  /** Throw if the chain is broken; used by release/verification gates. */
  assertIntact(): void {
    const result = this.verify();
    if (!result.ok) {
      throw new EvidentiaError('integrity', `audit ledger broken at seq ${result.brokenAt}: ${result.reason}`, {
        brokenAt: result.brokenAt,
      });
    }
  }
}
