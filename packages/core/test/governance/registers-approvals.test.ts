import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/storage/database.ts';
import { AuditLedger } from '../../src/audit/ledger.ts';
import { AiSystemRegister, ModelRegistry, ProcessingRegister } from '../../src/governance/registers.ts';
import { ApprovalService } from '../../src/governance/approvals.ts';
import { fixedClock } from '../../src/shared/clock.ts';

function setup() {
  const db = openDatabase();
  const clock = fixedClock('2026-09-18T09:00:00Z');
  const ledger = new AuditLedger(db, clock);
  return { db, clock, ledger, models: new ModelRegistry(db, ledger, clock), systems: new AiSystemRegister(db, ledger, clock), processing: new ProcessingRegister(db, ledger, clock), approvals: new ApprovalService(db, ledger, clock) };
}

const ctx = { tenantId: 'acme', actor: 'dpo@acme.example' };

test('model registry upsert is validated, audited with before/after state, and tenant-scoped', () => {
  const { models, ledger } = setup();
  const { id } = models.upsert(ctx, {
    provider: 'mistral', model: 'mistral-large-latest', displayName: 'Mistral Large', adapter: 'openai-compatible', hosting: 'eu',
    dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true, subprocessors: [] },
    allowedDataClasses: ['public', 'internal'], approvalStatus: 'draft',
  });
  models.setApprovalStatus(ctx, id, 'approved', 'DPA signed 2026-09-01');
  assert.equal(models.get('acme', id).record.approvalStatus, 'approved');
  assert.equal(models.list('other-tenant').length, 0);
  const events = ledger.list({ objectType: 'model', objectId: id });
  assert.deepEqual(events.map((e) => e.action), ['model.register', 'model.approval_status']);
  assert.deepEqual(events[1]?.previousState, { approvalStatus: 'draft' });
  assert.throws(() => models.upsert(ctx, { provider: '', model: 'x' } as never));
});

test('AI system register flags overdue reviews', () => {
  const { systems, clock } = setup();
  systems.upsert(ctx, {
    name: 'Draft generator', capability: 'evidence-grounded drafting', purpose: 'Draft website content from approved knowledge', owner: 'content-lead@acme.example',
    provider: 'mistral', model: 'mistral-large-latest', dataClasses: ['public', 'internal'], jurisdiction: 'BE', deploymentRole: 'deployer',
    riskClassification: 'limited', riskReasoning: 'Not an Annex III use case; Article 50 transparency applies to published AI-assisted text.',
    article50Applicable: true, humanOversight: 'Every publication requires a named human approver.', reviewDate: '2026-01-01',
  });
  assert.equal(systems.overdueReviews('acme', clock.now()).length, 1);
});

test('processing register stores Art. 30 style records', () => {
  const { processing } = setup();
  processing.create(ctx, {
    purpose: 'Knowledge ingestion for GEO analysis', legalBasis: 'legitimate-interests', legitimateInterestAssessment: 'LIA-2026-04', role: 'controller',
    dataCategories: ['author names', 'business contact details'], dataSubjects: ['employees', 'customers'], retentionDays: 1825, dpiaRequired: true, dpiaReference: 'DPIA-2026-02',
    processors: [{ name: 'Mistral AI', role: 'inference', dpa: true, location: 'FR' }],
  });
  assert.equal(processing.list('acme').length, 1);
});

test('approvals enforce four-eyes, bind to the payload hash and cannot be replayed', () => {
  const { approvals } = setup();
  const payload = { draftId: 'd1', bodyHash: 'abc' };
  const a = approvals.request({ tenantId: 'acme', action: 'draft.publish', objectType: 'draft', objectId: 'd1', requestedBy: 'writer', payload, policyId: 'eu-default' });
  assert.equal(a.status, 'pending');
  assert.throws(() => approvals.decide({ tenantId: 'acme', id: a.id, decidedBy: 'writer', decision: 'approved' }), /four-eyes/);
  approvals.decide({ tenantId: 'acme', id: a.id, decidedBy: 'editor', decision: 'approved', note: 'ok' });
  assert.throws(() => approvals.consume({ tenantId: 'acme', id: a.id, payload: { ...payload, bodyHash: 'changed' }, actor: 'system' }), /payload changed/);
  const consumed = approvals.consume({ tenantId: 'acme', id: a.id, payload, actor: 'system' });
  assert.equal(consumed.status, 'consumed');
  assert.throws(() => approvals.consume({ tenantId: 'acme', id: a.id, payload, actor: 'system' }), /is consumed/);
  assert.throws(() => approvals.decide({ tenantId: 'acme', id: a.id, decidedBy: 'editor', decision: 'rejected' }), /not pending/);
  assert.equal(approvals.listPending('acme').length, 0);
});

test('approvals expire after 30 days and cannot be decided or consumed once stale', () => {
  const { approvals, clock } = setup();
  const payload = { draftId: 'd-exp', bodyHash: 'abc' };
  const a = approvals.request({ tenantId: 'acme', action: 'draft.publish', objectType: 'draft', objectId: 'd-exp', requestedBy: 'writer', payload, policyId: 'eu-default' });
  clock.tick(31 * 24 * 60 * 60 * 1000);
  assert.throws(() => approvals.decide({ tenantId: 'acme', id: a.id, decidedBy: 'editor', decision: 'approved' }), /is expired/);
  assert.equal(approvals.get('acme', a.id).status, 'expired');
});

test('an approval already granted also expires 30 days after the original request, so a stale approval cannot be consumed', () => {
  const { approvals, clock } = setup();
  const payload = { draftId: 'd-exp2', bodyHash: 'abc' };
  const a = approvals.request({ tenantId: 'acme', action: 'draft.publish', objectType: 'draft', objectId: 'd-exp2', requestedBy: 'writer', payload, policyId: 'eu-default' });
  approvals.decide({ tenantId: 'acme', id: a.id, decidedBy: 'editor', decision: 'approved' });
  clock.tick(31 * 24 * 60 * 60 * 1000);
  assert.throws(() => approvals.consume({ tenantId: 'acme', id: a.id, payload, actor: 'system' }), /is expired/);
});

test('four-eyes excludes every contributor passed via excludedActors, not only the original requester', () => {
  const { approvals } = setup();
  const payload = { draftId: 'd-multi', bodyHash: 'abc' };
  const a = approvals.request({ tenantId: 'acme', action: 'draft.publish', objectType: 'draft', objectId: 'd-multi', requestedBy: 'writer', payload, policyId: 'eu-default' });
  // The requester (writer) is always excluded; excludedActors additionally excludes an editor
  // who contributed to the draft (e.g. by editing it) but did not request the gate themselves.
  assert.throws(() => approvals.decide({ tenantId: 'acme', id: a.id, decidedBy: 'editor', decision: 'approved', excludedActors: ['editor'] }), /four-eyes/);
  const decided = approvals.decide({ tenantId: 'acme', id: a.id, decidedBy: 'approver', decision: 'approved', excludedActors: ['editor'] });
  assert.equal(decided.status, 'approved');
});

test('tenant isolation: approvals from another tenant are not visible', () => {
  const { approvals } = setup();
  const a = approvals.request({ tenantId: 'acme', action: 'x', objectType: 'o', objectId: '1', requestedBy: 'u', payload: {} });
  assert.throws(() => approvals.get('other', a.id), /not found/);
});
