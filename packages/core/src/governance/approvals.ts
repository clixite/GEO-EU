import type { Database } from '../storage/database.ts';
import type { AuditLedger } from '../audit/ledger.ts';
import { fingerprint, newId } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';
import { EvidentiaError, notFound } from '../shared/errors.ts';

/**
 * Human approval gates.
 *
 * An approval binds a specific actor's decision to the exact payload that was
 * reviewed (payload hash). Executing the action later with a different payload
 * fails the check, so a draft cannot be edited after approval and still published.
 * Four-eyes: the decider must differ from the requester. Every transition is audited.
 */

export type ApprovalState = 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed';

export interface Approval {
  id: string;
  tenantId: string;
  action: string;
  objectType: string;
  objectId: string;
  requestedBy: string;
  requestedAt: string;
  reason: string | null;
  status: ApprovalState;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  policyId: string | null;
  payloadHash: string;
}

interface Row {
  id: string;
  tenant_id: string;
  action: string;
  object_type: string;
  object_id: string;
  requested_by: string;
  requested_at: string;
  reason: string | null;
  status: ApprovalState;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  policy_id: string | null;
  payload_hash: string;
}

const fromRow = (r: Row): Approval => ({
  id: r.id,
  tenantId: r.tenant_id,
  action: r.action,
  objectType: r.object_type,
  objectId: r.object_id,
  requestedBy: r.requested_by,
  requestedAt: r.requested_at,
  reason: r.reason,
  status: r.status,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
  policyId: r.policy_id,
  payloadHash: r.payload_hash,
});

export class ApprovalService {
  readonly db: Database;
  readonly ledger: AuditLedger;
  readonly clock: Clock;

  constructor(db: Database, ledger: AuditLedger, clock: Clock = systemClock) {
    this.db = db;
    this.ledger = ledger;
    this.clock = clock;
  }

  request(input: {
    tenantId: string;
    action: string;
    objectType: string;
    objectId: string;
    requestedBy: string;
    payload: unknown;
    reason?: string;
    policyId?: string;
    requestId?: string;
  }): Approval {
    const id = newId();
    const now = this.clock.now().toISOString();
    const payloadHash = fingerprint(input.payload);
    this.db.raw
      .prepare(
        `INSERT INTO approvals (id, tenant_id, action, object_type, object_id, requested_by, requested_at, reason, status, policy_id, payload_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(id, input.tenantId, input.action, input.objectType, input.objectId, input.requestedBy, now, input.reason ?? null, input.policyId ?? null, payloadHash);
    this.ledger.append({
      tenantId: input.tenantId,
      actor: input.requestedBy,
      action: 'approval.request',
      objectType: input.objectType,
      objectId: input.objectId,
      approvalId: id,
      ...(input.policyId ? { policyId: input.policyId } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      newState: { status: 'pending', action: input.action, payloadHash },
      ...(input.reason ? { evidence: { reason: input.reason } } : {}),
    });
    return this.get(input.tenantId, id);
  }

  get(tenantId: string, id: string): Approval {
    const row = this.db.raw.prepare('SELECT * FROM approvals WHERE tenant_id = ? AND id = ?').get(tenantId, id) as unknown as Row | undefined;
    if (!row) throw notFound('approval', id);
    return fromRow(row);
  }

  listPending(tenantId: string): Approval[] {
    return (this.db.raw.prepare("SELECT * FROM approvals WHERE tenant_id = ? AND status = 'pending' ORDER BY requested_at").all(tenantId) as unknown as Row[]).map(fromRow);
  }

  decide(input: { tenantId: string; id: string; decidedBy: string; decision: 'approved' | 'rejected'; note?: string }): Approval {
    return this.db.transaction(() => {
      const current = this.get(input.tenantId, input.id);
      if (current.status !== 'pending') {
        throw new EvidentiaError('conflict', `approval is ${current.status}, not pending`, { id: input.id });
      }
      if (current.requestedBy === input.decidedBy) {
        throw new EvidentiaError('policy_denied', 'four-eyes rule: requester cannot approve their own request', { id: input.id });
      }
      const now = this.clock.now().toISOString();
      this.db.raw
        .prepare('UPDATE approvals SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?')
        .run(input.decision, input.decidedBy, now, input.note ?? null, input.id);
      this.ledger.append({
        tenantId: input.tenantId,
        actor: input.decidedBy,
        action: `approval.${input.decision}`,
        objectType: current.objectType,
        objectId: current.objectId,
        approvalId: input.id,
        ...(current.policyId ? { policyId: current.policyId } : {}),
        previousState: { status: 'pending' },
        newState: { status: input.decision, payloadHash: current.payloadHash },
        ...(input.note ? { evidence: { note: input.note } } : {}),
      });
      return this.get(input.tenantId, input.id);
    });
  }

  /**
   * Verify that an approved decision exists for this exact payload and mark it
   * consumed so it cannot be replayed. Throws `approval_required` otherwise.
   */
  consume(input: { tenantId: string; id: string; payload: unknown; actor: string }): Approval {
    return this.db.transaction(() => {
      const current = this.get(input.tenantId, input.id);
      if (current.status !== 'approved') {
        throw new EvidentiaError('approval_required', `approval ${input.id} is ${current.status}`, { id: input.id });
      }
      const hash = fingerprint(input.payload);
      if (hash !== current.payloadHash) {
        throw new EvidentiaError('approval_required', 'payload changed since approval; a new approval is required', {
          id: input.id,
          approvedHash: current.payloadHash,
          presentedHash: hash,
        });
      }
      this.db.raw.prepare("UPDATE approvals SET status = 'consumed' WHERE id = ?").run(input.id);
      this.ledger.append({
        tenantId: input.tenantId,
        actor: input.actor,
        action: 'approval.consume',
        objectType: current.objectType,
        objectId: current.objectId,
        approvalId: input.id,
        previousState: { status: 'approved' },
        newState: { status: 'consumed', payloadHash: hash },
      });
      return this.get(input.tenantId, input.id);
    });
  }
}
