import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoProvider } from '../../src/providers/demoProvider.ts';
import { buildGroundedPrompt, verifyDraft, type EvidenceItem } from '../../src/content/grounding.ts';

const EVIDENCE: EvidenceItem[] = [
  { id: 'E1', text: 'Northwind Bank SA reconciles 2.3 million payments per day across 14 countries.', locator: 'https://www.northwind.example/reconciliation', title: 'Payment reconciliation', headingPath: '', authorityLevel: 'official', modifiedAt: null },
  { id: 'E2', text: 'Customer support recordings are deleted after 90 days. Erasure requests are handled within 30 days.', locator: 'https://www.northwind.example/privacy', title: 'Retention', headingPath: '', authorityLevel: 'official', modifiedAt: null },
];

test('demo provider produces drafts that verify as fully grounded', async () => {
  const p = new DemoProvider();
  const messages = buildGroundedPrompt({ title: 'Reconciliation at Northwind', audience: 'treasurers', intent: 'explain', brand: 'Northwind Bank' }, EVIDENCE);
  const r = await p.complete('demo-eu', { tenantId: 't', workload: 'drafting', dataClasses: ['internal'], messages });
  assert.match(r.text, /^# Reconciliation at Northwind/);
  assert.match(r.text, /\[E1\]\./);
  const v = verifyDraft(r.text, EVIDENCE);
  assert.equal(v.unsupportedClaims, 0, v.claims.filter((c) => !c.supported).map((c) => c.reason).join('; '));
  assert.ok(v.materialClaims >= 2);
});

test('demo provider observatory answers are deterministic per request id', async () => {
  const p = new DemoProvider();
  const req = { tenantId: 't', workload: 'observatory', dataClasses: ['public'] as const, messages: [{ role: 'system' as const, content: 'search assistant. brand: Northwind Bank' }, { role: 'user' as const, content: 'Who reconciles payments?' }], requestId: 'run:q1:0:3' };
  const a = await p.complete('demo-eu', req);
  const b = await p.complete('demo-eu', req);
  assert.equal(a.text, b.text);
  assert.ok(Array.isArray(a.citations));
});
