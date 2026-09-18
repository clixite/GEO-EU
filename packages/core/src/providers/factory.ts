import type { ModelRecord } from '../governance/schemas.ts';
import type { ProviderAdapter, SecretResolver } from './types.ts';
import { providerKeyName } from './types.ts';
import { OpenAICompatibleProvider } from './openaiCompatible.ts';
import { AnthropicProvider } from './anthropic.ts';
import { GoogleProvider } from './google.ts';
import { LocalEmbeddingProvider } from './localEmbedding.ts';
import { FakeProvider } from './fake.ts';
import type { SafeFetchOptions } from '../net/safeFetch.ts';

/**
 * Builds one adapter per registered provider from model-registry records.
 * Endpoints default to the vendor's public API; EU-hosted or self-hosted
 * endpoints are configured through `record.endpoint`. API keys are resolved by
 * conventional secret name (EVIDENTIA_PROVIDER_<PROVIDER>_API_KEY) and never stored.
 */
const DEFAULT_ENDPOINTS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com',
};

export function buildAdapters(records: readonly ModelRecord[], secrets: SecretResolver, options: { fetchOptions?: SafeFetchOptions; webSearch?: boolean } = {}): ProviderAdapter[] {
  const adapters = new Map<string, ProviderAdapter>();
  for (const r of records) {
    if (adapters.has(r.provider)) continue;
    const secretName = providerKeyName(r.provider);
    const fetchOptions = options.fetchOptions ?? {};
    switch (r.adapter) {
      case 'openai-compatible': {
        const baseUrl = r.endpoint ?? DEFAULT_ENDPOINTS[r.provider];
        if (!baseUrl) continue; // unknown provider without endpoint: cannot route, reported by the router as "no adapter"
        const azure = r.provider.startsWith('azure');
        adapters.set(r.provider, new OpenAICompatibleProvider({ id: r.provider, baseUrl, secretName, secrets, authStyle: azure ? 'api-key' : 'bearer', fetchOptions }));
        break;
      }
      case 'anthropic':
        adapters.set(r.provider, new AnthropicProvider({ id: r.provider, ...(r.endpoint ? { baseUrl: r.endpoint } : {}), secretName, secrets, fetchOptions, ...(options.webSearch ? { webSearch: true } : {}) }));
        break;
      case 'google':
        adapters.set(r.provider, new GoogleProvider({ id: r.provider, ...(r.endpoint ? { baseUrl: r.endpoint } : {}), secretName, secrets, fetchOptions, ...(options.webSearch ? { grounding: true } : {}) }));
        break;
      case 'local':
        adapters.set(r.provider, new LocalEmbeddingProvider());
        break;
      case 'fake':
        adapters.set(r.provider, new FakeProvider(r.provider));
        break;
    }
  }
  if (!adapters.has('local')) adapters.set('local', new LocalEmbeddingProvider());
  return [...adapters.values()];
}
