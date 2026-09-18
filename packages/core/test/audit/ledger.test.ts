import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../src/storage/database.ts';
import { AuditLedger, GENESIS_HASH } from '../../src/audit/ledger.ts';
import { fixedClock } from '../../src/shared/clock.ts';

function ledger() {
  const db = openDatabase();
  const clock = fixedClock('2026-09-18T10:00:00Z');
  return { db, ledger: new AuditLedger(db, clock), clock };
}

test('append chains hashes from the genesis hash and verify passes', () => {
  const { ledger: l } = ledger();
  const e1 = l.append({ tenantId: 't1', actor: 'alice', action: 'draft.create', objectType: 'draft', objectId: 'd1' });
  const e2 = l.append({
    tenantId: 't1',
    actor: 'bob',
    action: 'draft.approve',
    objectType: 'draft',
    objectId: 'd1',
    approvalId: 'a1',
    previousState: { status: 'review' },
    newState: { status: 'approved' },
  });
  assert.equal(e1.seq, 1);
  assert.equal(e1.prevHash, GENESIS_HASH);
  assert.equal(e2.prevHash, e1.hash);
  const result = l.verify();
  assert.deepEqual(result, { ok: true, count: 2, headHash: e2.hash });
});

test('tampering with a stored event breaks verification at that sequence', () => {
  const { db, ledger: l } = ledger();
  l.append({ tenantId: 't1', actor: 'alice', action: 'a', objectType: 'o', objectId: '1' });
  const e2 = l.append({ tenantId: 't1', actor: 'alice', action: 'b', objectType: 'o', objectId: '1' });
  l.append({ tenantId: 't1', actor: 'alice', action: 'c', objectType: 'o', objectId: '1' });
  db.raw.prepare('UPDATE audit_events SET actor = ? WHERE seq = ?').run('mallory', e2.seq);
  const result = l.verify();
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.brokenAt, 2);
    assert.equal(result.reason, 'content hash mismatch');
  }
  assert.throws(() => l.assertIntact(), /audit ledger broken at seq 2/);
});

test('deleting an event breaks the chain (previous hash mismatch)', () => {
  const { db, ledger: l } = ledger();
  l.append({ tenantId: 't1', actor: 'alice', action: 'a', objectType: 'o', objectId: '1' });
  l.append({ tenantId: 't1', actor: 'alice', action: 'b', objectType: 'o', objectId: '1' });
  l.append({ tenantId: 't1', actor: 'alice', action: 'c', objectType: 'o', objectId: '1' });
  db.raw.prepare('DELETE FROM audit_events WHERE seq = 2').run();
  const result = l.verify();
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.brokenAt, 3);
});

test('list filters by tenant and object and rejects invalid input', () => {
  const { ledger: l } = ledger();
  l.append({ tenantId: 't1', actor: 'a', action: 'x', objectType: 'draft', objectId: 'd1' });
  l.append({ tenantId: 't2', actor: 'a', action: 'x', objectType: 'draft', objectId: 'd2' });
  assert.equal(l.list({ tenantId: 't1' }).length, 1);
  assert.equal(l.list({ objectType: 'draft', objectId: 'd2' })[0]?.tenantId, 't2');
  assert.throws(() => l.append({ tenantId: '', actor: 'a', action: 'x', objectType: 'o', objectId: '1' }));
});
