import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleProvider } from '../../src/providers/openaiCompatible.ts';
import { AnthropicProvider } from '../../src/providers/anthropic.ts';
import { GoogleProvider } from '../../src/providers/google.ts';
import { buildAdapters } from '../../src/providers/factory.ts';
import type { ModelRecord } from '../../src/governance/schemas.ts';

const secrets = { get: (n: string) => (n.endsWith('_API_KEY') ? 'sk-test-1234567890abcdef' : undefined), require: (n: string) => (n.endsWith('_API_KEY') ? 'sk-test-1234567890abcdef' : (() => { throw new Error('missing'); })()) };
const resolve = async () => ['93.184.216.34'];

function capture(response: unknown, status = 200) {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return new Response(typeof response === 'string' ? response : JSON.stringify(response), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, fetchOptions: { fetchImpl, resolve } };
}

const req = { tenantId: 't', workload: 'w', dataClasses: ['public'] as const, messages: [{ role: 'system' as const, content: 'Be brief.' }, { role: 'user' as const, content: 'Who is Northwind?' }] };

test('OpenAI-compatible adapter sends bearer auth, maps usage/citations and errors', async () => {
  const c = capture({ model: 'gpt-x-2026', system_fingerprint: 'fp_1', choices: [{ message: { content: 'Northwind is a bank.', annotations: [{ type: 'url_citation', url_citation: { url: 'https://www.northwind.example/', title: 'Northwind' } }] }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } } });
  const p = new OpenAICompatibleProvider({ id: 'openai', baseUrl: 'https://api.openai.com/v1/', secretName: 'EVIDENTIA_PROVIDER_OPENAI_API_KEY', secrets, fetchOptions: c.fetchOptions });
  const r = await p.complete('gpt-x', { ...req, jsonSchema: { type: 'object' } });
  assert.equal(c.calls[0]?.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(c.calls[0]?.headers['authorization'], 'Bearer sk-test-1234567890abcdef');
  assert.equal((c.calls[0]?.body as { response_format: { type: string } }).response_format.type, 'json_schema');
  assert.equal(r.text, 'Northwind is a bank.');
  assert.equal(r.modelVersion, 'fp_1');
  assert.deepEqual(r.usage, { inputTokens: 12, outputTokens: 5, cachedInputTokens: 4 });
  assert.deepEqual(r.citations, [{ url: 'https://www.northwind.example/', title: 'Northwind' }]);

  const e = capture({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], usage: { prompt_tokens: 3 } });
  const emb = await new OpenAICompatibleProvider({ id: 'openai', baseUrl: 'https://api.openai.com/v1', secretName: 'EVIDENTIA_PROVIDER_OPENAI_API_KEY', secrets, fetchOptions: e.fetchOptions }).embed('emb', { tenantId: 't', workload: 'w', dataClasses: ['public'], texts: ['a', 'b'] });
  assert.deepEqual([...(emb.vectors[0] as Float32Array)], [1, 0], 'embeddings re-ordered by index');
  assert.equal(emb.dimensions, 2);

  const bad = capture({ error: { message: 'invalid model sk-leak-should-not-matter' } }, 400);
  await assert.rejects(new OpenAICompatibleProvider({ id: 'openai', baseUrl: 'https://api.openai.com/v1', secretName: 'EVIDENTIA_PROVIDER_OPENAI_API_KEY', secrets, fetchOptions: bad.fetchOptions }).complete('m', req), (err: { code: string }) => err.code === 'provider_error');
  const down = capture('', 503);
  await assert.rejects(new OpenAICompatibleProvider({ id: 'openai', baseUrl: 'https://api.openai.com/v1', secretName: 'EVIDENTIA_PROVIDER_OPENAI_API_KEY', secrets, fetchOptions: down.fetchOptions }).complete('m', req), (err: { code: string }) => err.code === 'provider_unavailable');
  const azure = capture({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] });
  await new OpenAICompatibleProvider({ id: 'azure-openai', baseUrl: 'https://contoso.openai.azure.com/openai/v1', secretName: 'EVIDENTIA_PROVIDER_AZURE_OPENAI_API_KEY', secrets, authStyle: 'api-key', fetchOptions: azure.fetchOptions }).complete('m', req);
  assert.equal(azure.calls[0]?.headers['api-key'], 'sk-test-1234567890abcdef');
});

test('Anthropic adapter separates system prompt, adds web search tool and collects citations', async () => {
  const c = capture({ model: 'claude-x', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Northwind ', citations: [{ type: 'web_search_result_location', url: 'https://www.northwind.example/a', title: 'A' }] }, { type: 'text', text: 'is a bank.', citations: [{ url: 'https://www.northwind.example/a' }] }], usage: { input_tokens: 20, output_tokens: 7, cache_read_input_tokens: 10 } });
  const p = new AnthropicProvider({ secretName: 'EVIDENTIA_PROVIDER_ANTHROPIC_API_KEY', secrets, webSearch: true, fetchOptions: c.fetchOptions });
  const r = await p.complete('claude-x', req);
  const body = c.calls[0]?.body as { system: string; messages: { role: string }[]; tools: { type: string }[] };
  assert.equal(c.calls[0]?.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.calls[0]?.headers['x-api-key'], 'sk-test-1234567890abcdef');
  assert.equal(body.system, 'Be brief.');
  assert.deepEqual(body.messages.map((m) => m.role), ['user']);
  assert.equal(body.tools[0]?.type, 'web_search_20250305');
  assert.equal(r.text, 'Northwind is a bank.');
  assert.deepEqual(r.citations, [{ url: 'https://www.northwind.example/a', title: 'A' }]);
  assert.deepEqual(r.usage, { inputTokens: 20, outputTokens: 7, cachedInputTokens: 10 });
  assert.equal(p.capabilities().embeddings, false);
  await assert.rejects(p.embed('x', { tenantId: 't', workload: 'w', dataClasses: ['public'], texts: ['a'] }), /embeddings/);
});

test('Google adapter uses header auth, grounding tool and maps grounding chunks to citations', async () => {
  const c = capture({ modelVersion: 'gemini-x-001', candidates: [{ content: { parts: [{ text: 'Northwind is a bank.' }] }, finishReason: 'STOP', groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.northwind.example/', title: 'Northwind' } }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } });
  const p = new GoogleProvider({ secretName: 'EVIDENTIA_PROVIDER_GOOGLE_API_KEY', secrets, grounding: true, fetchOptions: c.fetchOptions });
  const r = await p.complete('gemini-x', req);
  assert.match(c.calls[0]?.url ?? '', /\/v1beta\/models\/gemini-x:generateContent$/);
  assert.equal(c.calls[0]?.headers['x-goog-api-key'], 'sk-test-1234567890abcdef');
  assert.ok(!(c.calls[0]?.url ?? '').includes('key='), 'API key must not be in the URL');
  const body = c.calls[0]?.body as { systemInstruction: { parts: { text: string }[] }; tools: unknown[] };
  assert.equal(body.systemInstruction.parts[0]?.text, 'Be brief.');
  assert.equal(body.tools.length, 1);
  assert.equal(r.modelVersion, 'gemini-x-001');
  assert.deepEqual(r.citations, [{ url: 'https://www.northwind.example/', title: 'Northwind' }]);
  const e = capture({ embeddings: [{ values: [0.1, 0.2, 0.3] }] });
  const emb = await new GoogleProvider({ secretName: 'EVIDENTIA_PROVIDER_GOOGLE_API_KEY', secrets, fetchOptions: e.fetchOptions }).embed('text-embedding-x', { tenantId: 't', workload: 'w', dataClasses: ['public'], texts: ['a'] });
  assert.equal(emb.dimensions, 3);
});

test('factory builds one adapter per provider with sensible defaults and never leaks secrets', () => {
  const base = { displayName: 'x', hosting: 'eu' as const, modalities: ['text' as const], dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true, subprocessors: [] }, allowedDataClasses: ['public' as const], approvedUseCases: [], approvalStatus: 'approved' as const, evaluationStatus: 'passed' as const, qualityTier: 3, latencyTier: 3 };
  const records: ModelRecord[] = [
    { ...base, provider: 'mistral', model: 'mistral-large-latest', adapter: 'openai-compatible' },
    { ...base, provider: 'mistral', model: 'mistral-small-latest', adapter: 'openai-compatible' },
    { ...base, provider: 'anthropic', model: 'claude-x', adapter: 'anthropic' },
    { ...base, provider: 'google', model: 'gemini-x', adapter: 'google' },
    { ...base, provider: 'vllm-onprem', model: 'llama', adapter: 'openai-compatible', endpoint: 'https://llm.corp.example/v1' },
    { ...base, provider: 'unknown-vendor', model: 'm', adapter: 'openai-compatible' },
    { ...base, provider: 'fake', model: 'f', adapter: 'fake' },
  ];
  const adapters = buildAdapters(records, secrets);
  const ids = adapters.map((a) => a.id).sort();
  assert.deepEqual(ids, ['anthropic', 'fake', 'google', 'local', 'mistral', 'vllm-onprem']);
  assert.ok(!JSON.stringify(adapters.map((a) => ({ id: a.id, caps: a.capabilities('x') }))).includes('sk-test'));
});
