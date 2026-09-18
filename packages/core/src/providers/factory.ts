import type { ModelRecord } from '../governance/schemas.ts';
import type { ProviderAdapter, SecretResolver } from './types.ts';
import { providerKeyName } from './types.ts';
import { OpenAICompatibleProvider } from './openaiCompatible.ts';
import { AnthropicProvider } from './anthropic.ts';
import { GoogleProvider } from './google.ts';
import { LocalEmbeddingProvider } from './localEmbedding.ts';
import { FakeProvider } from './fake.ts';
import type { SafeFetchOptions } from '../net/safeFetch.ts';
import { EvidentiaError } from '../shared/errors.ts';

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

/**
 * For the well-known cloud providers above, a custom `record.endpoint` is only
 * accepted if its host is one of the vendor's own documented hosts (default,
 * Azure-fronted, or EU-region variants). Without this check, a model-registry
 * entry naming a well-known provider (whose secret name is a shared, long-lived
 * API key) could point `endpoint` at an arbitrary host and have that key sent
 * there. Providers not in `DEFAULT_ENDPOINTS` are self-hosted/custom adapters by
 * design (vLLM, Ollama, LiteLLM…) and are unrestricted, since routing to an
 * operator-chosen host is exactly their purpose and their secret is scoped to
 * that provider id, not a shared vendor key.
 */
const ALLOWED_ENDPOINT_HOSTS: Record<string, readonly string[]> = {
  openai: ['api.openai.com'],
  mistral: ['api.mistral.ai'],
  anthropic: ['api.anthropic.com'],
  google: ['generativelanguage.googleapis.com', 'aiplatform.googleapis.com'],
};

function assertTrustedEndpoint(provider: string, endpoint: string): void {
  const allowed = ALLOWED_ENDPOINT_HOSTS[provider];
  if (!allowed) return; // not a well-known vendor id: custom endpoints are the intended use case
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    throw new EvidentiaError('validation', `invalid endpoint URL for provider ${provider}`, { provider, endpoint });
  }
  if (!allowed.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new EvidentiaError('validation', `endpoint host for well-known provider "${provider}" is not on its allow-list; refusing to send its API key to an untrusted host`, { provider, endpoint, allowed });
  }
}

export function buildAdapters(records: readonly ModelRecord[], secrets: SecretResolver, options: { fetchOptions?: SafeFetchOptions; webSearch?: boolean } = {}): ProviderAdapter[] {
  const adapters = new Map<string, ProviderAdapter>();
  for (const r of records) {
    if (adapters.has(r.provider)) continue;
    if (r.endpoint) assertTrustedEndpoint(r.provider, r.endpoint);
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
