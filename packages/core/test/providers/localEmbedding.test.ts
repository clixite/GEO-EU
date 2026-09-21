import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosine, localEmbed, LOCAL_EMBEDDING_DIMENSIONS } from '../../src/providers/localEmbedding.ts';

test('local embedding is deterministic, normalised and lexically sensitive', () => {
  const a = localEmbed('Evidentia governs generative visibility for European organisations');
  const b = localEmbed('Evidentia governs generative visibility for European organisations');
  const c = localEmbed('Evidentia: generative visibility, governed, for organisations in Europe');
  const d = localEmbed('The weather in Brussels is mild and rainy in autumn');
  assert.equal(a.length, LOCAL_EMBEDDING_DIMENSIONS);
  assert.ok(Math.abs(cosine(a, b) - 1) < 1e-6);
  assert.ok(cosine(a, c) > cosine(a, d), 'paraphrase should be closer than unrelated text');
  assert.ok(cosine(a, d) < 0.2);
  let norm = 0;
  for (const x of a) norm += x * x;
  assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-5);
});
