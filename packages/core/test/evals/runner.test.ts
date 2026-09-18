import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parsePolicy } from '../../src/governance/policy.ts';
import { Dataset, runDataset } from '../../src/evals/runner.ts';

const root = new URL('../../../../', import.meta.url);
const policy = parsePolicy(readFileSync(new URL('governance/policies/eu-default.yaml', root), 'utf8'));
const datasetsDir = new URL('evals/datasets/', root);

test('every shipped eval dataset validates and passes end to end', async () => {
  const files = readdirSync(datasetsDir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 3, 'datasets present');
  for (const f of files) {
    const dataset = Dataset.parse(JSON.parse(readFileSync(new URL(f, datasetsDir), 'utf8')));
    const report = await runDataset(dataset, policy, new Date('2026-09-18T00:00:00Z'));
    const failures = report.results.filter((r) => !r.pass).map((r) => `${r.id}: ${r.details.join('; ')}`);
    assert.equal(report.failed, 0, `${f}:\n${failures.join('\n')}`);
    assert.equal(report.total, dataset.cases.length);
  }
});

test('a failing case is reported with actionable details', async () => {
  const report = await runDataset(
    { id: 'x', version: '0', description: 'x', cases: [{ kind: 'injection', id: 'should-fail', input: { text: 'hello' }, expect: { high: true } }] },
    policy,
  );
  assert.equal(report.failed, 1);
  assert.match(report.results[0]?.details[0] ?? '', /high=false/);
});
