import type { CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities } from './types.ts';
import { localEmbed, LOCAL_EMBEDDING_DIMENSIONS } from './localEmbedding.ts';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * Scriptable in-memory provider for tests, evals and the demo dataset.
 * Responses are chosen by a handler so tests can assert routing, fallback,
 * cost accounting and failure handling without network access.
 */
export type FakeHandler = (model: string, request: CompletionRequest) => CompletionResponse | Error | Promise<CompletionResponse | Error>;

export class FakeProvider implements ProviderAdapter {
  readonly id: string;
  readonly calls: { model: string; request: CompletionRequest }[] = [];
  #handler: FakeHandler;
  #caps: ProviderCapabilities;

  constructor(id = 'fake', handler?: FakeHandler, caps?: Partial<ProviderCapabilities>) {
    this.id = id;
    this.#handler = handler ?? ((model, req) => echo(this.id, model, req));
    this.#caps = { chat: true, embeddings: true, jsonOutput: true, webSearch: false, ...caps };
  }

  capabilities(): ProviderCapabilities {
    return this.#caps;
  }

  async complete(model: string, request: CompletionRequest): Promise<CompletionResponse> {
    this.calls.push({ model, request });
    const result = await this.#handler(model, request);
    if (result instanceof Error) throw result;
    return result;
  }

  async embed(model: string, request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.#caps.embeddings) throw new EvidentiaError('unsupported', `${this.id} has no embeddings`);
    return {
      provider: this.id,
      model,
      dimensions: LOCAL_EMBEDDING_DIMENSIONS,
      vectors: request.texts.map(localEmbed),
      usage: { inputTokens: request.texts.join(' ').length / 4, outputTokens: 0, cachedInputTokens: 0 },
    };
  }
}

export function echo(provider: string, model: string, req: CompletionRequest): CompletionResponse {
  const last = req.messages.at(-1)?.content ?? '';
  return {
    text: `[${provider}/${model}] ${last.slice(0, 200)}`,
    provider,
    model,
    usage: { inputTokens: Math.ceil(req.messages.map((m) => m.content).join('').length / 4), outputTokens: 20, cachedInputTokens: 0 },
    finishReason: 'stop',
  };
}
