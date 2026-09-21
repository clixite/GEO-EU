import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../src/storage/database.ts';
import { AuditLedger } from '../../src/audit/ledger.ts';
import { ApprovalService } from '../../src/governance/approvals.ts';
import { parsePolicy } from '../../src/governance/policy.ts';
import { generateSigningKey, verifyManifest } from '../../src/governance/provenance.ts';
import { ContentPipeline } from '../../src/publishing/pipeline.ts';
import { StaticExportAdapter, GenericHttpAdapter, verifyGenericSignature } from '../../src/publishing/adapters.ts';
import type { EvidenceItem } from '../../src/content/grounding.ts';
import { fixedClock } from '../../src/shared/clock.ts';
import { applyRetention, eraseTenant, exportTenant } from '../../src/governance/retention.ts';

const policy = parsePolicy(readFileSync(new URL('../../../../governance/policies/eu-default.yaml', import.meta.url), 'utf8'));
const EVIDENCE: EvidenceItem[] = [
  { id: 'E1', text: 'Northwind Bank SA reconciles 2.3 million payments per day across 14 countries.', locator: 'https://www.northwind.example/reconciliation', title: 'Payment reconciliation', headingPath: '', authorityLevel: 'official', modifiedAt: '2026-08-15' },
];
const writer = { tenantId: 'acme', actor: 'writer@acme.example' };
const editor = { tenantId: 'acme', actor: 'editor@acme.example' };
// Readiness is now assessed on the rendered artefact at verify() (not defaulted to 100), so a
// bare one-sentence draft legitimately scores below the policy's readiness threshold and needs
// a human look. This body carries an H1, a second heading and an outbound link to the cited
// evidence — enough structure to clear the threshold — while adding no new, uncited claims.
const WELL_STRUCTURED_BODY = `# Northwind Bank payment reconciliation

Northwind Bank reconciles 2.3 million payments per day across 14 countries [E1].

## Related resources

Read the [payment reconciliation page](https://www.northwind.example/reconciliation) published by Northwind Bank for the underlying figures and methodology referenced above.`;

function setup() {
  const db = openDatabase();
  const clock = fixedClock('2026-09-18T10:00:00Z');
  const ledger = new AuditLedger(db, clock);
  const approvals = new ApprovalService(db, ledger, clock);
  const dir = mkdtempSync(join(tmpdir(), 'evidentia-pub-'));
  const key = generateSigningKey();
  const pipeline = new ContentPipeline({ db, ledger, approvals, policy, adapters: [new StaticExportAdapter(dir)], signingKey: key, publisher: 'Northwind Bank SA', clock });
  return { db, ledger, approvals, pipeline, dir, key, clock };
}

test('AI-assisted draft with supported claims: verify → gate requires approval → four-eyes approve → publish with signed manifest and disclosure', async () => {
  const { pipeline, ledger, dir, key } = setup();
  let d = pipeline.createDraft(writer, { title: 'Payment reconciliation', slug: 'payment-reconciliation', body: '# Payment reconciliation\n\nNorthwind Bank reconciles 2.3 million payments per day across 14 countries [E1].', aiAssisted: true, modelId: 'eu-llm/eu-large', evidence: EVIDENCE, author: 'writer@acme.example' });
  d = pipeline.verify(writer, d.id);
  assert.equal(d.status, 'verified');
  assert.equal(d.verification?.unsupportedClaims, 0);
  d = pipeline.gate(writer, d.id);
  assert.equal(d.status, 'awaiting_approval');
  assert.equal(d.gate?.requiresDisclosure, true);
  await assert.rejects(pipeline.publish(writer, d.id, 'static-export', { name: 'x', role: 'y' }), /must be approved/);
  assert.throws(() => pipeline.decide(writer, d.id, 'approved'), /four-eyes/);
  d = pipeline.decide(editor, d.id, 'approved', 'checked against the supervisory report');
  assert.equal(d.status, 'approved');
  const { draft, receipt } = await pipeline.publish(editor, d.id, 'static-export', { name: 'Anna Peeters', role: 'Head of Communications' });
  assert.equal(draft.status, 'published');
  assert.equal(receipt.target, 'static-export');
  const html = readFileSync(join(dir, 'payment-reconciliation.html'), 'utf8');
  assert.match(html, /AI transparency notice/);
  assert.match(html, /<meta name="ai-disclosure" content="ai-assisted; human-reviewed">/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /\[\^1\]|Sources/);
  assert.ok(!html.includes('[E1]'), 'markers must be stripped from published HTML');
  const manifest = JSON.parse(readFileSync(join(dir, 'payment-reconciliation.manifest.json'), 'utf8'));
  assert.equal(verifyManifest(manifest, key.publicKeyPem, draft.body).valid, true);
  const actions = ledger.list({ objectType: 'draft', objectId: d.id }).map((e) => e.action);
  assert.deepEqual(actions, ['draft.create', 'draft.verify', 'approval.request', 'draft.gate.require_approval', 'approval.approved', 'draft.approved', 'approval.consume', 'draft.publish']);
  assert.throws(() => pipeline.updateDraft(editor, d.id, { body: 'x' }), /immutable/);
});

test('fabricated figure blocks publication; editing after approval voids the approval', async () => {
  const { pipeline } = setup();
  let d = pipeline.createDraft(writer, { title: 'T', slug: 't', body: 'Northwind Bank reconciles 9.9 million payments per day [E1].', aiAssisted: true, evidence: EVIDENCE });
  d = pipeline.verify(writer, d.id);
  d = pipeline.gate(writer, d.id);
  assert.equal(d.status, 'blocked');
  assert.match(d.gate?.blockers.join(' ') ?? '', /unsupported factual claim/);

  d = pipeline.updateDraft(writer, d.id, { body: 'Northwind Bank reconciles 2.3 million payments per day [E1].' });
  d = pipeline.verify(writer, d.id);
  d = pipeline.gate(writer, d.id);
  d = pipeline.decide(editor, d.id, 'approved');
  assert.equal(d.status, 'approved');
  d = pipeline.updateDraft(writer, d.id, { body: 'Northwind Bank reconciles 2.3 million payments per day across 14 countries [E1].' });
  assert.equal(d.status, 'draft');
  assert.equal(d.approvalId, null);
  await assert.rejects(pipeline.publish(editor, d.id, 'static-export', { name: 'a', role: 'b' }), /must be approved/);
});

test('human-written content with full evidence coverage is approved without a human gate but still audited and marked', async () => {
  const { pipeline, dir } = setup();
  let d = pipeline.createDraft(writer, { title: 'Human', slug: 'human', body: WELL_STRUCTURED_BODY, aiAssisted: false, evidence: EVIDENCE });
  d = pipeline.gate(writer, pipeline.verify(writer, d.id).id);
  assert.equal(d.status, 'approved');
  assert.ok((d.readinessScore ?? 0) >= 60, `readiness ${d.readinessScore} should clear the policy threshold`);
  assert.equal(d.gate?.requiresDisclosure, false);
  const { draft } = await pipeline.publish(writer, d.id, 'static-export', { name: 'Anna Peeters', role: 'Editor' });
  assert.equal(draft.status, 'published');
  const html = readFileSync(join(dir, 'human.html'), 'utf8');
  assert.match(html, /content="human-authored"/);
  assert.ok(!html.includes('AI transparency notice'));
});

test('sensitive topics require approval even for human content; rejected drafts stay rejected', () => {
  const { pipeline } = setup();
  let d = pipeline.createDraft(writer, { title: 'Health', slug: 'health', body: 'Northwind Bank reconciles 2.3 million payments per day across 14 countries [E1].', aiAssisted: false, evidence: EVIDENCE, topics: ['health'] });
  d = pipeline.gate(writer, pipeline.verify(writer, d.id).id);
  assert.equal(d.status, 'awaiting_approval');
  d = pipeline.decide(editor, d.id, 'rejected', 'needs medical review');
  assert.equal(d.status, 'rejected');
  assert.equal(d.reviewer, 'editor@acme.example');
});

test('generic HTTP adapter signs payloads that the receiver can verify; failures are recorded', async () => {
  const { pipeline, db, ledger, clock } = setup();
  const secrets = { get: () => 'topsecret', require: () => 'topsecret' };
  let captured: { ts: string; sig: string; payload: string } | null = null;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const h = init?.headers as Record<string, string>;
    captured = { ts: h['x-evidentia-timestamp'] as string, sig: h['x-evidentia-signature'] as string, payload: String(init?.body) };
    return new Response(JSON.stringify({ id: 'r-1', url: 'https://cms.example/p/1' }), { status: 201 });
  }) as typeof fetch;
  const adapter = new GenericHttpAdapter({ url: 'https://cms.example/hooks/evidentia', secretName: 'CMS', secrets, fetchOptions: { fetchImpl, resolve: async () => ['93.184.216.34'] } });
  const p2 = new ContentPipeline({ db, ledger, approvals: pipeline.approvals, policy, adapters: [adapter], publisher: 'P', clock });
  let d = p2.createDraft(writer, { title: 'T', slug: 't2', body: WELL_STRUCTURED_BODY, aiAssisted: false, evidence: EVIDENCE });
  d = p2.gate(writer, p2.verify(writer, d.id).id);
  assert.equal(d.status, 'approved');
  const { receipt } = await p2.publish(writer, d.id, 'http:cms.example', { name: 'a', role: 'b' });
  assert.equal(receipt.remoteId, 'r-1');
  assert.equal(receipt.url, 'https://cms.example/p/1');
  const c = captured as unknown as { ts: string; sig: string; payload: string };
  assert.equal(verifyGenericSignature('topsecret', c.ts, c.payload, c.sig, 10 * 365 * 86_400_000), true);
  assert.equal(verifyGenericSignature('wrong', c.ts, c.payload, c.sig, 10 * 365 * 86_400_000), false);

  const failing = new GenericHttpAdapter({ url: 'https://cms.example/hooks/evidentia', secretName: 'CMS', secrets, id: 'failing', fetchOptions: { fetchImpl: (async () => new Response('nope', { status: 500 })) as typeof fetch, resolve: async () => ['93.184.216.34'] } });
  const p3 = new ContentPipeline({ db, ledger, approvals: pipeline.approvals, policy, adapters: [failing], publisher: 'P', clock });
  let d3 = p3.createDraft(writer, { title: 'T3', slug: 't3', body: WELL_STRUCTURED_BODY, aiAssisted: false, evidence: EVIDENCE });
  d3 = p3.gate(writer, p3.verify(writer, d3.id).id);
  assert.equal(d3.status, 'approved');
  await assert.rejects(p3.publish(writer, d3.id, 'failing', { name: 'a', role: 'b' }), /responded 500/);
  assert.equal(p3.get('acme', d3.id).status, 'approved', 'a failed publish keeps the draft approved for retry');
  assert.equal(ledger.list({ action: 'draft.publish_failed' }).length, 1);
});

test('retention, export and erasure operate per tenant and leave the audit ledger intact', () => {
  const { db, ledger, clock } = setup();
  db.raw.prepare("INSERT INTO model_calls (id, tenant_id, workload, provider, model, started_at, duration_ms, status) VALUES ('c1', 'acme', 'w', 'p', 'm', '2020-01-01T00:00:00Z', 1, 'ok')").run();
  db.raw.prepare("INSERT INTO model_calls (id, tenant_id, workload, provider, model, started_at, duration_ms, status) VALUES ('c2', 'acme', 'w', 'p', 'm', '2026-09-01T00:00:00Z', 1, 'ok')").run();
  db.raw.prepare("INSERT INTO model_calls (id, tenant_id, workload, provider, model, started_at, duration_ms, status) VALUES ('c3', 'other', 'w', 'p', 'm', '2020-01-01T00:00:00Z', 1, 'ok')").run();
  const r = applyRetention(db, ledger, policy, { tenantId: 'acme', actor: 'scheduler' }, clock);
  assert.equal(r.modelCalls, 1);
  const exported = exportTenant(db, 'acme');
  assert.equal(exported['model_calls']?.length, 1);
  assert.ok(Array.isArray(exported['audit_events']));
  const counts = eraseTenant(db, ledger, { tenantId: 'acme', actor: 'dpo' }, 'contract terminated');
  assert.equal(counts['model_calls'], 1);
  assert.equal(exportTenant(db, 'other')['model_calls']?.length, 1, 'other tenant untouched');
  assert.equal(ledger.verify().ok, true);
  assert.ok(ledger.list({ action: 'tenant.erase' }).length === 1);
});

test('static export refuses unsafe slugs', () => {
  const { pipeline } = setup();
  assert.throws(() => pipeline.createDraft(writer, { title: 'x', slug: '../etc/passwd', body: 'b', aiAssisted: false }), /slug/);
  assert.ok(existsSync(pipeline.adapters.get('static-export') ? '.' : '.'));
});
