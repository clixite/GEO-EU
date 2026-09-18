import type { SafeFetchOptions } from '../net/safeFetch.ts';
import type { CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities, SecretResolver } from './types.ts';
import { postJson, trimSlash } from './http.ts';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * Anthropic Messages API adapter. Supports the server-side web search tool for the
 * observatory (citations are returned in content blocks and must be displayed to
 * end users per Anthropic's terms — the observatory stores URLs, not answer text).
 */
export interface AnthropicOptions {
  id?: string;
  baseUrl?: string;
  secretName: string;
  secrets: SecretResolver;
  apiVersion?: string;
  webSearch?: boolean;
  maxSearchUses?: number;
  fetchOptions?: SafeFetchOptions;
}

interface MessagesResponse {
  model?: string;
  stop_reason?: string;
  content?: { type: string; text?: string; citations?: { type?: string; url?: string; title?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
}

export class AnthropicProvider implements ProviderAdapter {
  readonly id: string;
  readonly #opts: Required<Pick<AnthropicOptions, 'baseUrl' | 'apiVersion'>> & AnthropicOptions;

  constructor(options: AnthropicOptions) {
    this.id = options.id ?? 'anthropic';
    this.#opts = { ...options, baseUrl: trimSlash(options.baseUrl ?? 'https://api.anthropic.com'), apiVersion: options.apiVersion ?? '2023-06-01' };
  }

  capabilities(): ProviderCapabilities {
    return { chat: true, embeddings: false, jsonOutput: true, webSearch: !!this.#opts.webSearch };
  }

  async complete(model: string, request: CompletionRequest): Promise<CompletionResponse> {
    const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = request.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxOutputTokens ?? 2048,
      ...(system ? { system } : {}),
      messages,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(this.#opts.webSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: this.#opts.maxSearchUses ?? 3 }] } : {}),
    };
    if (request.jsonSchema) {
      body['system'] = `${system ? system + '\n\n' : ''}Respond only with a JSON object matching this JSON Schema:\n${JSON.stringify(request.jsonSchema)}`;
    }
    const res = await postJson<MessagesResponse>(`${this.#opts.baseUrl}/v1/messages`, body, { 'x-api-key': this.#opts.secrets.require(this.#opts.secretName), 'anthropic-version': this.#opts.apiVersion }, this.#opts.fetchOptions);
    const blocks = res.content ?? [];
    const text = blocks.filter((b) => b.type === 'text' && b.text).map((b) => b.text as string).join('');
    if (!blocks.length) throw new EvidentiaError('provider_error', 'empty response', { provider: this.id });
    const citations: { url: string; title?: string }[] = [];
    for (const b of blocks) for (const c of b.citations ?? []) if (c.url && !citations.some((x) => x.url === c.url)) citations.push({ url: c.url, ...(c.title ? { title: c.title } : {}) });
    return {
      text,
      provider: this.id,
      model: res.model ?? model,
      usage: { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0, cachedInputTokens: res.usage?.cache_read_input_tokens ?? 0 },
      finishReason: res.stop_reason === 'max_tokens' ? 'length' : res.stop_reason === 'end_turn' || res.stop_reason === 'stop_sequence' ? 'stop' : 'other',
      ...(this.#opts.webSearch || citations.length ? { citations } : {}),
    };
  }

  async embed(_model: string, _request: EmbeddingRequest): Promise<EmbeddingResponse> {
    throw new EvidentiaError('unsupported', 'Anthropic does not provide an embeddings endpoint; register a separate embedding model');
  }
}
