import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../../src/storage/database.ts';
import { AuditLedger } from '../../src/audit/ledger.ts';
import { parsePolicy } from '../../src/governance/policy.ts';
import { ApprovalService } from '../../src/governance/approvals.ts';
import { ModelRegistry, AiSystemRegister, ProcessingRegister } from '../../src/governance/registers.ts';
import { applyRetention, eraseTenant, exportTenant } from '../../src/governance/retention.ts';
import { KnowledgeStore } from '../../src/knowledge/store.ts';
import { ContentPipeline } from '../../src/publishing/pipeline.ts';
import { StaticExportAdapter } from '../../src/publishing/adapters.ts';
import { Observatory } from '../../src/observatory/runner.ts';
import { PolicyAwareRouter } from '../../src/providers/router.ts';
import { CostMeter } from '../../src/providers/costMeter.ts';
import { FakeProvider } from '../../src/providers/fake.ts';
import { localEmbed } from '../../src/providers/localEmbedding.ts';
import { fixedClock } from '../../src/shared/clock.ts';
import type { EvidenceItem } from '../../src/content/grounding.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const policy = parsePolicy(readFileSync(new URL('../../../../governance/policies/eu-default.yaml', import.meta.url), 'utf8'));

/**
 * Populates every tenant-scoped table (the full `TENANT_TABLES` surface in
 * retention.ts, plus chunks_fts and entity_mentions which are not directly in
 * that list) through the real services, for a realistic FK graph: a knowledge
 * document with claims/entities, a published draft (draft → publication), an
 * observatory run (query_set → observations), a live approval, and one row of
 * every register table. `eraseTenant` must clear all of it without an FK
 * violation and without touching the other tenant or the audit ledger.
 */
async function buildTenant(db: ReturnType<typeof openDatabase>, ledger: AuditLedger, clock: ReturnType<typeof fixedClock>, tenantId: string) {
  const ctx = { tenantId, actor: `writer@${tenantId}.example` };
  // Capitalised so the entity extractor (which looks for proper-noun patterns) actually finds an
  // organisation to resolve — a lowercase tenant id alone would not produce an `entities` row,
  // and this fixture needs one to exercise erasure of the entities table.
  const brand = `${tenantId[0]?.toUpperCase()}${tenantId.slice(1)} Corp`;
  const embedder = async (texts: string[]) => ({ vectors: texts.map(localEmbed), model: 'local-hash-384' });
  const store = new KnowledgeStore(db, ledger, { clock, embedder });
  const source = store.addSource(ctx, { kind: 'url', locator: `https://${tenantId}.example/page`, authorityLevel: 'official' });
  await store.ingest(ctx, { sourceId: source.id, content: `${brand} reconciles 2.3 million payments per day across 14 countries.`, contentType: 'text/plain' });

  const registry = new ModelRegistry(db, ledger, clock);
  const { id: modelId } = registry.upsert(ctx, {
    provider: 'eu-llm', model: 'eu-search', displayName: 'EU Search', adapter: 'fake', hosting: 'eu', approvalStatus: 'approved',
    dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true }, allowedDataClasses: ['public'],
  });

  const systems = new AiSystemRegister(db, ledger, clock);
  systems.upsert(ctx, {
    name: 'Draft generator', capability: 'evidence-grounded drafting', purpose: 'Draft content', owner: ctx.actor, provider: 'eu-llm', model: 'eu-search',
    dataClasses: ['public'], jurisdiction: 'BE', deploymentRole: 'deployer', riskClassification: 'limited', riskReasoning: 'Not Annex III.',
    article50Applicable: true, humanOversight: 'Human approves every publication.', reviewDate: '2027-01-01',
  });

  const processing = new ProcessingRegister(db, ledger, clock);
  processing.create(ctx, {
    purpose: 'Knowledge ingestion', legalBasis: 'legitimate-interests', legitimateInterestAssessment: 'LIA-1', role: 'controller',
    dataCategories: ['business contact details'], dataSubjects: ['customers'], retentionDays: 1825, dpiaRequired: false, processors: [],
  });

  const approvals = new ApprovalService(db, ledger, clock);
  const dir = mkdtempSync(join(tmpdir(), 'evidentia-erase-'));
  const pipeline = new ContentPipeline({ db, ledger, approvals, policy, adapters: [new StaticExportAdapter(dir)], publisher: brand, clock });
  const EVIDENCE: EvidenceItem[] = [{ id: 'E1', text: `${brand} reconciles 2.3 million payments per day across 14 countries.`, locator: `https://${tenantId}.example/page`, title: 'Reconciliation', headingPath: '', authorityLevel: 'official', modifiedAt: '2026-08-15' }];
  const body = `# ${brand} payment reconciliation\n\n${brand} reconciles 2.3 million payments per day across 14 countries [E1].\n\n## Related resources\n\nRead the [reconciliation page](https://${tenantId}.example/page) published by ${brand} for the underlying figures.`;
  let draft = pipeline.createDraft(ctx, { title: `${tenantId} reconciliation`, slug: `${tenantId}-recon`, body, aiAssisted: false, evidence: EVIDENCE });
  draft = pipeline.gate(ctx, pipeline.verify(ctx, draft.id).id);
  assert.equal(draft.status, 'approved', `test fixture draft must auto-approve (got ${draft.status})`);
  await pipeline.publish(ctx, draft.id, 'static-export', { name: 'Anna Peeters', role: 'Editor' });

  // A live, unconsumed approval (independent of the draft's own gate) so `approvals` has a row
  // that erasure must also remove.
  approvals.request({ tenantId, action: 'draft.publish', objectType: 'draft', objectId: draft.id, requestedBy: ctx.actor, payload: { x: 1 }, policyId: policy.id });

  const provider = new FakeProvider('eu-llm', (model, req) => ({ text: `${tenantId} Corp offers reconciliation.`, provider: 'eu-llm', model, modelVersion: '2026-09', usage: { inputTokens: 5, outputTokens: 5, cachedInputTokens: 0 }, finishReason: 'stop' }));
  const router = new PolicyAwareRouter({ registry, policy, ledger, meter: new CostMeter(db, { clock }), adapters: [provider], clock });
  const observatory = new Observatory(db, ledger, router, clock);
  const { id: querySetId } = observatory.saveQuerySet(ctx, { name: 'brand-visibility', brand: { name: brand }, queries: [{ id: 'q1', text: `Who is ${brand}?` }] });
  await observatory.run(ctx, { querySetId, models: [{ provider: 'eu-llm', model: 'eu-search' }], samples: 1 });

  db.raw.prepare("INSERT INTO model_calls (id, tenant_id, workload, provider, model, started_at, duration_ms, status) VALUES (?, ?, 'w', 'p', 'm', '2026-09-01T00:00:00Z', 1, 'ok')").run(`${tenantId}-mc`, tenantId);

  return { draftId: draft.id, modelId };
}

const TABLES_WITH_ROWS = ['sources', 'documents', 'chunks', 'claims', 'entities', 'ai_systems', 'model_registry', 'approvals', 'processing_records', 'drafts', 'publications', 'query_sets', 'observations', 'model_calls'] as const;

test('eraseTenant clears every tenant table and chunks_fts without an FK violation, leaves the other tenant and the audit ledger untouched', async () => {
  const db = openDatabase();
  const clock = fixedClock('2026-09-18T10:00:00Z');
  const ledger = new AuditLedger(db, clock);
  await buildTenant(db, ledger, clock, 'acme');
  await buildTenant(db, ledger, clock, 'globex');

  const countFor = (table: string, tenantId: string) => (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE tenant_id = ?`).get(tenantId) as { n: number }).n;
  for (const t of TABLES_WITH_ROWS) assert.ok(countFor(t, 'acme') > 0, `${t} should have acme rows before erasure`);
  const ftsCountFor = (tenantId: string) => (db.raw.prepare('SELECT COUNT(*) AS n FROM chunks_fts WHERE tenant_id = ?').get(tenantId) as { n: number }).n;
  assert.ok(ftsCountFor('acme') > 0, 'chunks_fts should be populated before erasure');

  // This is the assertion that matters: erasure must not throw, even though drafts, publications,
  // observations, query_sets, approvals and processing records all exist with live FK references.
  assert.doesNotThrow(() => eraseTenant(db, ledger, { tenantId: 'acme', actor: 'dpo' }, 'contract terminated'));

  for (const t of TABLES_WITH_ROWS) assert.equal(countFor(t, 'acme'), 0, `${t} must be empty for acme after erasure`);
  assert.equal(ftsCountFor('acme'), 0, 'chunks_fts must be cleared for acme after erasure');

  for (const t of TABLES_WITH_ROWS) assert.ok(countFor(t, 'globex'), `${t} must be untouched for the other tenant`);
  assert.ok(ftsCountFor('globex') > 0, 'chunks_fts must be untouched for the other tenant');

  assert.equal(ledger.verify().ok, true, 'the audit ledger (never pruned by erasure) remains hash-chain intact');
  assert.equal(ledger.list({ tenantId: 'acme', action: 'tenant.erase' }).length, 1);
  // The ledger itself is not a TENANT_TABLES member: erasure never deletes audit events.
  assert.ok(ledger.list({ tenantId: 'acme' }).length > 0, 'acme audit history is retained, not erased');
});

test('exportTenant and applyRetention operate on the same full fixture without error', async () => {
  const db = openDatabase();
  const clock = fixedClock('2026-09-18T10:00:00Z');
  const ledger = new AuditLedger(db, clock);
  await buildTenant(db, ledger, clock, 'acme');

  const exported = exportTenant(db, 'acme');
  for (const t of TABLES_WITH_ROWS) assert.ok((exported[t]?.length ?? 0) > 0, `export should include ${t}`);
  assert.ok(Array.isArray(exported['audit_events']) && exported['audit_events'].length > 0);
  assert.ok(Array.isArray(exported['entity_mentions']));

  assert.doesNotThrow(() => applyRetention(db, ledger, policy, { tenantId: 'acme', actor: 'scheduler' }, clock));
});
