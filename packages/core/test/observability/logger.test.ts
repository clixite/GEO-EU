import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Logger, memorySink, redact } from '../../src/observability/logger.ts';
import { fixedClock } from '../../src/shared/clock.ts';

test('redact masks secret keys, secret-looking values and prompt payloads', () => {
  const out = redact({
    apiKey: 'sk-abcdefghijklmnop',
    nested: { Authorization: 'Bearer abcdefghijkl', note: 'token sk-1234567890abcdef inside' },
    prompt: 'Write about our confidential merger',
    messages: [{ role: 'user', content: 'hi' }],
    safe: 'hello',
  }) as Record<string, unknown>;
  assert.equal(out['apiKey'], '[REDACTED]');
  assert.deepEqual(out['nested'], { Authorization: '[REDACTED]', note: 'token [REDACTED] inside' });
  const prompt = out['prompt'] as { sha256: string; length: number };
  assert.equal(prompt.length, 'Write about our confidential merger'.length);
  assert.match(prompt.sha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof (out['messages'] as { sha256: string }).sha256, 'string');
  assert.equal(out['safe'], 'hello');
});

test('logger emits structured records with inherited correlation context and level filtering', () => {
  const { sink, records } = memorySink();
  const root = new Logger({ sink, level: 'info', clock: fixedClock('2026-09-18T12:00:00Z') });
  const child = root.child({ correlationId: 'c-1', tenantId: 't1' }).child({ jobId: 'j-9' });
  child.debug('hidden');
  child.info('model call finished', { provider: 'anthropic', password: 'x' });
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    ts: '2026-09-18T12:00:00.000Z',
    level: 'info',
    msg: 'model call finished',
    correlationId: 'c-1',
    tenantId: 't1',
    jobId: 'j-9',
    provider: 'anthropic',
    password: '[REDACTED]',
  });
});
