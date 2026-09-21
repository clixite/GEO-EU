import type { SafeFetchOptions } from '../net/safeFetch.ts';
import type { CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities, SecretResolver } from './types.ts';
import { postJson, trimSlash } from './http.ts';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * Adapter for the OpenAI-compatible chat/embeddings API surface used by OpenAI,
 * Mistral, Azure OpenAI (with `api-key` header), and self-hosted servers
 * (vLLM, Ollama, LiteLLM…). The base URL is pinned as the only allowed host.
 */
export interface OpenAICompatibleOptions {
  id: string;
  baseUrl: string;
  secretName: string;
  secrets: SecretResolver;
  /** "bearer" (default) or "api-key" (Azure OpenAI). */
  authStyle?: 'bearer' | 'api-key';
  extraHeaders?: Record<string, string>;
  capabilities?: Partial<ProviderCapabilities>;
  fetchOptions?: SafeFetchOptions;
}

interface ChatResponse {
  model?: string;
  system_fingerprint?: string;
  choices?: { message?: { content?: string | null; annotations?: { type?: string; url_citation?: { url: string; title?: string } }[] }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  /** Perplexity (Sonar) returns citations at the response root, not as per-message annotations: a flat URL list on older API versions, `search_results` with titles on newer ones. */
  citations?: string[];
  search_results?: { url?: string; title?: string }[];
}

interface EmbeddingsResponse {
  model?: string;
  data?: { embedding: number[]; index: number }[];
  usage?: { prompt_tokens?: number };
}

export class OpenAICompatibleProvider implements ProviderAdapter {
  readonly id: string;
  readonly #opts: OpenAICompatibleOptions;

  constructor(options: OpenAICompatibleOptions) {
    this.id = options.id;
    this.#opts = { ...options, baseUrl: trimSlash(options.baseUrl) };
  }

  capabilities(): ProviderCapabilities {
    return { chat: true, embeddings: true, jsonOutput: true, webSearch: false, ...this.#opts.capabilities };
  }

  #headers(): Record<string, string> {
    const key = this.#opts.secrets.require(this.#opts.secretName);
    const auth = this.#opts.authStyle === 'api-key' ? { 'api-key': key } : { authorization: `Bearer ${key}` };
    return { ...auth, ...this.#opts.extraHeaders };
  }

  async complete(model: string, request: CompletionRequest): Promise<CompletionResponse> {
    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.jsonSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'evidentia_output', schema: request.jsonSchema, strict: true } } } : {}),
    };
    const res = await postJson<ChatResponse>(`${this.#opts.baseUrl}/chat/completions`, body, this.#headers(), this.#opts.fetchOptions);
    const choice = res.choices?.[0];
    if (!choice?.message) throw new EvidentiaError('provider_error', 'no completion choice returned', { provider: this.id });
    const citations: { url: string; title?: string }[] = [];
    for (const a of choice.message.annotations ?? []) {
      if (a.type === 'url_citation' && a.url_citation) citations.push({ url: a.url_citation.url, ...(a.url_citation.title ? { title: a.url_citation.title } : {}) });
    }
    for (const r of res.search_results ?? []) {
      if (r.url && !citations.some((c) => c.url === r.url)) citations.push({ url: r.url, ...(r.title ? { title: r.title } : {}) });
    }
    for (const url of res.citations ?? []) {
      if (!citations.some((c) => c.url === url)) citations.push({ url });
    }
    return {
      text: choice.message.content ?? '',
      provider: this.id,
      model: res.model ?? model,
      ...(res.system_fingerprint ? { modelVersion: res.system_fingerprint } : {}),
      usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0, cachedInputTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0 },
      finishReason: choice.finish_reason === 'length' ? 'length' : choice.finish_reason === 'content_filter' ? 'content_filter' : choice.finish_reason === 'stop' ? 'stop' : 'other',
      ...(citations.length ? { citations } : {}),
    };
  }

  async embed(model: string, request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const res = await postJson<EmbeddingsResponse>(`${this.#opts.baseUrl}/embeddings`, { model, input: request.texts }, this.#headers(), this.#opts.fetchOptions);
    const data = [...(res.data ?? [])].sort((a, b) => a.index - b.index);
    if (data.length !== request.texts.length) throw new EvidentiaError('provider_error', 'embedding count mismatch', { expected: request.texts.length, got: data.length });
    const vectors = data.map((d) => Float32Array.from(d.embedding));
    return { provider: this.id, model: res.model ?? model, dimensions: vectors[0]?.length ?? 0, vectors, usage: { inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: 0, cachedInputTokens: 0 } };
  }
}
