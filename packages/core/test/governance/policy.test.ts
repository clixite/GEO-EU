import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateModelAccess, evaluatePublication, parsePolicy, retentionDaysFor } from '../../src/governance/policy.ts';
import type { ModelRecord } from '../../src/governance/schemas.ts';

const policy = parsePolicy(readFileSync(new URL('../../../../governance/policies/eu-default.yaml', import.meta.url), 'utf8'));

function model(overrides: Partial<Omit<ModelRecord, 'dataPolicy'>> & { dataPolicy?: Partial<ModelRecord['dataPolicy']> } = {}): ModelRecord {
  const { dataPolicy, ...rest } = overrides;
  return {
    provider: 'acme',
    model: 'acme-1',
    displayName: 'Acme 1',
    adapter: 'openai-compatible',
    hosting: 'eu',
    modalities: ['text'],
    dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true, subprocessors: [], ...dataPolicy },
    allowedDataClasses: ['public', 'internal', 'confidential', 'personal'],
    approvedUseCases: [],
    approvalStatus: 'approved',
    evaluationStatus: 'passed',
    qualityTier: 3,
    latencyTier: 3,
    ...rest,
  };
}

test('eu-default policy parses with expected identity', () => {
  assert.equal(policy.id, 'eu-default');
  assert.equal(policy.modelAccess.defaultEffect, 'deny');
  assert.equal(retentionDaysFor(policy, 'audit_event'), 3650);
  assert.equal(retentionDaysFor(policy, 'unknown', 42), 42);
});

test('public content is allowed on any approved model, even US-hosted', () => {
  const d = evaluateModelAccess(policy, model({ hosting: 'us', allowedDataClasses: ['public'] }), ['public']);
  assert.equal(d.effect, 'allow');
  assert.deepEqual(d.matchedRules, ['public-approved']);
});

test('confidential data is denied on a US-hosted model and allowed on an EU model with DPA', () => {
  const us = evaluateModelAccess(policy, model({ hosting: 'us' }), ['public', 'confidential']);
  assert.equal(us.effect, 'deny');
  assert.match(us.reasons.join(' '), /hosting us not in eu\/eea\/self-hosted/);
  const eu = evaluateModelAccess(policy, model({ hosting: 'eu' }), ['confidential']);
  assert.equal(eu.effect, 'allow');
});

test('a provider that trains on inputs is denied for internal data even when everything else matches', () => {
  const d = evaluateModelAccess(policy, model({ dataPolicy: { usedForTraining: true } }), ['internal']);
  assert.equal(d.effect, 'deny');
  assert.ok(d.matchedRules.includes('never-train-on-confidential'));
});

test('personal data needs zero data retention; special-category needs self-hosted', () => {
  const noZdr = evaluateModelAccess(policy, model({ dataPolicy: { zeroDataRetention: false, retentionDays: 30 } }), ['personal']);
  assert.equal(noZdr.effect, 'deny');
  const ok = evaluateModelAccess(policy, model(), ['personal']);
  assert.equal(ok.effect, 'allow');
  const special = evaluateModelAccess(policy, model({ allowedDataClasses: ['special-category'] }), ['special-category']);
  assert.equal(special.effect, 'deny');
  const selfHosted = evaluateModelAccess(policy, model({ hosting: 'self-hosted', allowedDataClasses: ['special-category'] }), ['special-category']);
  assert.equal(selfHosted.effect, 'allow');
});

test('registry ceiling: policy cannot widen what the model record allows', () => {
  const d = evaluateModelAccess(policy, model({ allowedDataClasses: ['public'] }), ['internal']);
  assert.equal(d.effect, 'deny');
  assert.match(d.reasons[0] ?? '', /does not allow data class "internal"/);
});

test('draft (unapproved) models are denied by default', () => {
  const d = evaluateModelAccess(policy, model({ approvalStatus: 'draft' }), ['public']);
  assert.equal(d.effect, 'deny');
});

test('publication gate blocks unsupported claims, requires approval for AI-assisted content, and allows clean human content', () => {
  const blocked = evaluatePublication(policy, { aiAssisted: true, readinessScore: 90, evidenceCoverage: 0.9, unsupportedClaims: 2, topics: [], sourceKinds: [] });
  assert.equal(blocked.effect, 'deny');
  assert.equal(blocked.blockers.length, 1);

  const approval = evaluatePublication(policy, { aiAssisted: true, readinessScore: 90, evidenceCoverage: 0.95, unsupportedClaims: 0, topics: ['health'], sourceKinds: ['official'] });
  assert.equal(approval.effect, 'require_approval');
  assert.equal(approval.requiresDisclosure, true);
  assert.equal(approval.requiresMachineReadableMarking, true);
  assert.match(approval.reasons.join(' '), /sensitive topic\(s\): health/);

  const human = evaluatePublication(policy, { aiAssisted: false, readinessScore: 80, evidenceCoverage: 1, unsupportedClaims: 0, topics: [], sourceKinds: ['official'] });
  assert.equal(human.effect, 'allow');
  assert.equal(human.requiresDisclosure, false);

  const farm = evaluatePublication(policy, { aiAssisted: false, readinessScore: 80, evidenceCoverage: 1, unsupportedClaims: 0, topics: [], sourceKinds: ['content-farm'] });
  assert.equal(farm.effect, 'deny');
});

test('invalid policy YAML is rejected with a validation error', () => {
  assert.throws(() => parsePolicy('id: x\nversion: 0\ntitle: t\n'), /invalid policy document/);
});
