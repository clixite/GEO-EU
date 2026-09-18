import type { DataClass } from '../governance/schemas.ts';

/**
 * Model-agnostic provider abstraction. Adapters translate these neutral request and
 * response shapes to a vendor API. Nothing above this layer knows vendor formats.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  tenantId: string;
  /** Business workload name used for cost attribution and policy (e.g. "drafting"). */
  workload: string;
  dataClasses: readonly DataClass[];
  messages: ChatMessage[];
  maxOutputTokens?: number;
  temperature?: number;
  /** When set, adapters ask the model for JSON matching this schema (best effort). */
  jsonSchema?: Record<string, unknown>;
  requestId?: string;
  jobId?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export interface CompletionResponse {
  text: string;
  provider: string;
  model: string;
  modelVersion?: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'content_filter' | 'other';
  /** Provider-reported citations/web results if the model searched (observatory). */
  citations?: { url: string; title?: string }[];
}

export interface EmbeddingRequest {
  tenantId: string;
  workload: string;
  dataClasses: readonly DataClass[];
  texts: string[];
  requestId?: string;
}

export interface EmbeddingResponse {
  provider: string;
  model: string;
  dimensions: number;
  vectors: Float32Array[];
  usage: TokenUsage;
}

export interface ProviderCapabilities {
  chat: boolean;
  embeddings: boolean;
  jsonOutput: boolean;
  webSearch: boolean;
  maxContextTokens?: number;
}

export interface ProviderAdapter {
  readonly id: string;
  capabilities(model: string): ProviderCapabilities;
  complete(model: string, request: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse>;
  embed(model: string, request: EmbeddingRequest, signal?: AbortSignal): Promise<EmbeddingResponse>;
}

/** Resolves secrets by logical name. Default implementation reads process.env. */
export interface SecretResolver {
  get(name: string): string | undefined;
  require(name: string): string;
}

export function envSecrets(env: NodeJS.ProcessEnv = process.env): SecretResolver {
  return {
    get: (name) => env[name],
    require: (name) => {
      const value = env[name];
      if (!value) throw new Error(`secret ${name} is not configured`);
      return value;
    },
  };
}

/** Conventional env var name for a provider key: EVIDENTIA_PROVIDER_<PROVIDER>_API_KEY. */
export function providerKeyName(provider: string): string {
  return `EVIDENTIA_PROVIDER_${provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
}

/** Rough token estimate (≈4 chars/token) used for budgeting before a call. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
