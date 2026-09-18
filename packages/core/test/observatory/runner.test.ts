import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../../src/storage/database.ts';
import { AuditLedger } from '../../src/audit/ledger.ts';
import { ModelRegistry } from '../../src/governance/registers.ts';
import { parsePolicy } from '../../src/governance/policy.ts';
import { FakeProvider } from '../../src/providers/fake.ts';
import { CostMeter } from '../../src/providers/costMeter.ts';
import { PolicyAwareRouter } from '../../src/providers/router.ts';
import { Observatory, detectCitations, detectMentions } from '../../src/observatory/runner.ts';
import { fixedClock } from '../../src/shared/clock.ts';
import { sha256 } from '../../src/shared/hash.ts';

const policy = parsePolicy(readFileSync(new URL('../../../../governance/policies/eu-default.yaml', import.meta.url), 'utf8'));
const ctx = { tenantId: 'acme', actor: 'analyst' };

function setup() {
  const db = openDatabase();
  const clock = fixedClock('2026-09-18T10:00:00Z');
  const ledger = new AuditLedger(db, clock);
  const registry = new ModelRegistry(db, ledger, clock);
  registry.upsert(ctx, { provider: 'eu-llm', model: 'eu-search', displayName: 'EU Search', adapter: 'fake', hosting: 'eu', approvalStatus: 'approved', dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true }, allowedDataClasses: ['public'] });
  registry.upsert(ctx, { provider: 'eu-llm', model: 'eu-old', displayName: 'EU Old', adapter: 'fake', hosting: 'eu', approvalStatus: 'draft', dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true }, allowedDataClasses: ['public'] });
  // Deterministic stochastic answers: mention Northwind for ~half the samples, cite for a third, mention competitor sometimes.
  const provider = new FakeProvider('eu-llm', (model, req) => {
    const seed = parseInt(sha256(req.requestId ?? req.messages.map((m) => m.content).join('')).slice(0, 6), 16);
    const mention = seed % 2 === 0;
    const cite = seed % 3 === 0;
    const competitor = seed % 5 === 0;
    const text = `${competitor ? 'Contoso Payments is one option. ' : ''}${mention ? 'Northwind Bank offers reconciliation services in 14 countries. ' : 'Several banks offer reconciliation. '}${cite ? 'Source: https://www.northwind.example/reconciliation' : ''}`;
    return { text, provider: 'eu-llm', model, modelVersion: '2026-09', usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0 }, finishReason: 'stop', citations: cite ? [{ url: 'https://www.northwind.example/reconciliation' }] : [] };
  });
  const router = new PolicyAwareRouter({ registry, policy, ledger, meter: new CostMeter(db, { clock }), adapters: [provider], clock });
  return { db, ledger, observatory: new Observatory(db, ledger, router, clock), provider };
}

test('mention and citation detection are word-boundary and domain aware', () => {
  assert.equal(detectMentions('We recommend Northwind Bank for this.', ['Northwind Bank']).mentioned, true);
  assert.equal(detectMentions('northwindbank.example is unrelated', ['Northwind Bank']).mentioned, false);
  assert.equal(detectMentions('Try NORTHWIND.', ['Northwind']).mentioned, true);
  assert.deepEqual(detectCitations('see https://www.northwind.example/a and https://other.example/b', undefined, ['northwind.example']), { toolCited: [], textLinked: ['https://www.northwind.example/a'] });
  assert.deepEqual(detectCitations('', [{ url: 'https://docs.northwind.example/x' }], ['northwind.example']), { toolCited: ['https://docs.northwind.example/x'], textLinked: [] });
  // A URL the model merely typed in prose is not tool-cited, even if the provider's citations
  // array also happens to include it (the text match is skipped once the tool already reported it).
  assert.deepEqual(detectCitations('source: https://www.northwind.example/a', [{ url: 'https://www.northwind.example/a' }], ['northwind.example']), { toolCited: ['https://www.northwind.example/a'], textLinked: [] });
});

test('query sets are versioned; runs sample repeatedly, store hashes not text, and reports carry Wilson intervals', async () => {
  const { observatory, db, ledger } = setup();
  const set = { name: 'reconciliation-q3', brand: { name: 'Northwind Bank', aliases: ['Northwind'], domains: ['northwind.example'] }, competitors: [{ name: 'Contoso Payments' }], queries: [
    { id: 'q1', text: 'Which banks offer payment reconciliation in Belgium?', intent: 'commercial' as const, paraphrases: ['Belgian banks with reconciliation services'] },
    { id: 'q2', text: 'Who is Northwind Bank?', intent: 'navigational' as const, branded: true },
  ] };
  const v1 = observatory.saveQuerySet(ctx, set);
  const v2 = observatory.saveQuerySet(ctx, set);
  assert.equal(v1.querySet.version, 1);
  assert.equal(v2.querySet.version, 2);
  assert.equal(observatory.listQuerySets('acme').length, 2);

  const summary = await observatory.run(ctx, { querySetId: v2.id, models: [{ provider: 'eu-llm', model: 'eu-search' }], samples: 8 });
  assert.equal(summary.observations, (2 + 1) * 8);
  assert.equal(summary.errors, 0);
  const row = db.raw.prepare("SELECT record, response_hash FROM observations LIMIT 1").get() as { record: string; response_hash: string };
  assert.ok(!row.record.includes('Northwind Bank offers'), 'raw answer text is not stored by default');
  assert.match(row.response_hash, /^[a-f0-9]{64}$/);

  const report = observatory.report('acme', v2.id);
  assert.equal(report.totalObservations, 24);
  assert.ok(report.overall.mention.n === 24);
  assert.ok(report.overall.mention.low <= report.overall.mention.p && report.overall.mention.p <= report.overall.mention.high);
  assert.ok(report.overall.mention.halfWidth > 0.1, 'n=24 is honest about uncertainty');
  const q1 = report.queries.find((q) => q.queryId === 'q1');
  assert.ok(q1 && q1.mention.n === 16, 'text + one paraphrase × 8 samples');
  assert.ok('Contoso Payments' in (q1?.competitorMentions ?? {}));
  assert.ok(report.perIntent['commercial'] && report.perIntent['navigational']);
  assert.deepEqual(report.seriesBreaks, []);
  assert.match(report.method, /Wilson/);
  assert.deepEqual(ledger.list({ action: 'observatory.run_end' }).length, 1);
});

test('the observatory records denial for a policy-refused model and continues the run for other models rather than aborting it', async () => {
  const { observatory, ledger } = setup();
  const { id } = observatory.saveQuerySet(ctx, { name: 's', brand: { name: 'Northwind Bank' }, queries: [{ id: 'q1', text: 'Who is Northwind?' }, { id: 'q2', text: 'Where is Northwind based?' }] });
  const summary = await observatory.run(ctx, { querySetId: id, models: [{ provider: 'eu-llm', model: 'eu-old' }, { provider: 'eu-llm', model: 'eu-search' }], samples: 2 });
  assert.equal(summary.denied, 1, 'the denied model is recorded once, not once per query/sample');
  assert.equal(summary.observations, 4, 'the approved model still ran to completion');
  assert.equal(summary.perModel['eu-llm/eu-old']?.observations, 0);
  assert.ok((summary.perModel['eu-llm/eu-search']?.observations ?? 0) === 4);
  assert.equal(ledger.list({ action: 'observatory.model_denied' }).length, 1);
});
