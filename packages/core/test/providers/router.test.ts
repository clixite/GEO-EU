import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDatabase } from '../../src/storage/database.ts';
import { AuditLedger } from '../../src/audit/ledger.ts';
import { ModelRegistry } from '../../src/governance/registers.ts';
import { parsePolicy } from '../../src/governance/policy.ts';
import { FakeProvider, echo } from '../../src/providers/fake.ts';
import { CostMeter } from '../../src/providers/costMeter.ts';
import { PolicyAwareRouter } from '../../src/providers/router.ts';
import { fixedClock } from '../../src/shared/clock.ts';
import type { ModelRecordInput } from '../../src/governance/schemas.ts';

const policy = parsePolicy(readFileSync(new URL('../../../../governance/policies/eu-default.yaml', import.meta.url), 'utf8'));
const ctx = { tenantId: 'acme', actor: 'admin' };

function setup(opts: { euFails?: boolean; budgets?: ConstructorParameters<typeof CostMeter>[1] } = {}) {
  const db = openDatabase();
  const clock = fixedClock('2026-09-18T10:00:00Z');
  const ledger = new AuditLedger(db, clock);
  const registry = new ModelRegistry(db, ledger, clock);
  const alerts: string[] = [];
  const meter = new CostMeter(db, { clock, ...(opts.budgets ?? {}), onBudgetExceeded: (b, spent) => alerts.push(`${b.workload ?? '*'}:${spent.toFixed(4)}`) });
  const euProvider = new FakeProvider('eu-llm', (model, req) => (opts.euFails ? new Error('eu upstream 503') : echo('eu-llm', model, req)));
  const usProvider = new FakeProvider('us-llm');
  const base: Omit<ModelRecordInput, 'provider' | 'model' | 'displayName' | 'hosting' | 'dataPolicy'> = { adapter: 'fake', approvalStatus: 'approved' };
  registry.upsert(ctx, { ...base, provider: 'eu-llm', model: 'eu-large', displayName: 'EU Large', hosting: 'eu', qualityTier: 4, cost: { inputPerMillionTokensEur: 2, outputPerMillionTokensEur: 6 },
    dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true }, allowedDataClasses: ['public', 'internal', 'confidential', 'personal'] });
  registry.upsert(ctx, { ...base, provider: 'eu-llm', model: 'eu-small', displayName: 'EU Small', hosting: 'eu', qualityTier: 2, latencyTier: 1, cost: { inputPerMillionTokensEur: 0.2, outputPerMillionTokensEur: 0.6 },
    dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true }, allowedDataClasses: ['public', 'internal', 'confidential', 'personal'] });
  registry.upsert(ctx, { ...base, provider: 'us-llm', model: 'us-frontier', displayName: 'US Frontier', hosting: 'us', qualityTier: 5, cost: { inputPerMillionTokensEur: 3, outputPerMillionTokensEur: 15 },
    dataPolicy: { retentionDays: 30, usedForTraining: false, dpaAvailable: true }, allowedDataClasses: ['public'] });
  const router = new PolicyAwareRouter({ registry, policy, ledger, meter, adapters: [euProvider, usProvider], clock });
  return { db, ledger, registry, meter, router, euProvider, usProvider, alerts };
}

const msg = (text: string) => ({ messages: [{ role: 'user' as const, content: text }] });

test('public content ranks the best-quality model first (US frontier) and meters cost', async () => {
  const { router, usProvider, meter, ledger } = setup();
  const res = await router.complete({ tenantId: 'acme', workload: 'drafting', dataClasses: ['public'], need: 'chat', strategy: 'quality', request: msg('hello') });
  assert.equal(res.provider, 'us-llm');
  assert.equal(usProvider.calls.length, 1);
  const s = meter.summary('acme');
  assert.equal(s.calls, 1);
  assert.ok(s.costEur > 0);
  const events = ledger.list({ action: 'model.call' });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.modelId, 'us-llm/us-frontier');
  assert.equal(JSON.stringify(events[0]?.evidence).includes('hello'), false, 'prompt text must never reach the ledger');
});

test('confidential content never routes to the US model, even on quality strategy', async () => {
  const { router, usProvider, euProvider } = setup();
  const res = await router.complete({ tenantId: 'acme', workload: 'drafting', dataClasses: ['confidential'], need: 'chat', strategy: 'quality', request: msg('secret plan') });
  assert.equal(res.provider, 'eu-llm');
  assert.equal(res.model, 'eu-large');
  assert.equal(usProvider.calls.length, 0);
  assert.equal(euProvider.calls.length, 1);
});

test('fallback stays inside the policy-allowed set: EU failure does not escalate to US', async () => {
  const { router, usProvider, euProvider, ledger, meter } = setup({ euFails: true });
  await assert.rejects(
    router.complete({ tenantId: 'acme', workload: 'drafting', dataClasses: ['internal'], need: 'chat', request: msg('x') }),
    /all 2 policy-allowed model\(s\) failed/,
  );
  assert.equal(usProvider.calls.length, 0);
  assert.equal(euProvider.calls.length, 2);
  assert.equal(ledger.list({ action: 'model.call_failed' }).length, 2);
  assert.equal(meter.summary('acme').errors, 2);
});

test('cost strategy prefers the cheap EU model; latency strategy too', async () => {
  const { router } = setup();
  const cheap = await router.complete({ tenantId: 'acme', workload: 'classify', dataClasses: ['public'], need: 'chat', strategy: 'cost', request: msg('x') });
  assert.equal(cheap.model, 'eu-small');
  const fast = await router.complete({ tenantId: 'acme', workload: 'classify', dataClasses: ['public'], need: 'chat', strategy: 'latency', request: msg('x') });
  assert.equal(fast.model, 'eu-small');
});

test('no allowed model → policy_denied with explainable reasons and an audit event', async () => {
  const { router, ledger } = setup();
  await assert.rejects(
    router.complete({ tenantId: 'acme', workload: 'drafting', dataClasses: ['special-category'], need: 'chat', request: msg('x') }),
    (e: Error & { code: string; details: { reasons: string[] } }) => e.code === 'policy_denied' && e.details.reasons.length === 3,
  );
  assert.equal(ledger.list({ action: 'model.call_denied' }).length, 1);
});

test('hard budget blocks further calls; soft budget only alerts', async () => {
  const { router, meter, alerts } = setup({ budgets: { budgets: [{ tenantId: 'acme', workload: 'drafting', windowDays: 30, limitEur: 0.00001, hard: false }] } });
  await router.complete({ tenantId: 'acme', workload: 'drafting', dataClasses: ['public'], need: 'chat', request: msg('x') });
  await router.complete({ tenantId: 'acme', workload: 'drafting', dataClasses: ['public'], need: 'chat', request: msg('x') });
  assert.ok(alerts.length >= 1);
  meter.setBudgets([{ tenantId: 'acme', windowDays: 30, limitEur: 0.00001, hard: true }]);
  await assert.rejects(router.complete({ tenantId: 'acme', workload: 'drafting', dataClasses: ['public'], need: 'chat', request: msg('x') }), /hard budget/);
});

test('embeddings route through the same policy and use the first allowed candidate', async () => {
  const { router } = setup();
  const res = await router.embed({ tenantId: 'acme', workload: 'index', dataClasses: ['confidential'], need: 'embeddings', texts: ['alpha', 'beta'] });
  assert.equal(res.provider, 'eu-llm');
  assert.equal(res.vectors.length, 2);
  assert.equal(res.dimensions, 384);
});
