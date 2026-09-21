import type { SafeFetchOptions } from '../net/safeFetch.ts';
import type { CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities, SecretResolver } from './types.ts';
import { postJson, trimSlash } from './http.ts';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * Google Gemini API adapter (generateContent / embedContent). Grounding with
 * Google Search can be enabled for the observatory; note that the Gemini API
 * terms restrict link-level monitoring of grounded results, so Evidentia stores
 * only aggregate mention/citation outcomes by default (see docs/GEO_METHODOLOGY.md §5.6).
 */
export interface GoogleOptions {
  id?: string;
  baseUrl?: string;
  secretName: string;
  secrets: SecretResolver;
  grounding?: boolean;
  fetchOptions?: SafeFetchOptions;
}

interface GenerateResponse {
  modelVersion?: string;
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string; groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number };
}

interface EmbedResponse {
  embeddings?: { values: number[] }[];
}

export class GoogleProvider implements ProviderAdapter {
  readonly id: string;
  readonly #opts: GoogleOptions & { baseUrl: string };

  constructor(options: GoogleOptions) {
    this.id = options.id ?? 'google';
    this.#opts = { ...options, baseUrl: trimSlash(options.baseUrl ?? 'https://generativelanguage.googleapis.com') };
  }

  capabilities(): ProviderCapabilities {
    return { chat: true, embeddings: true, jsonOutput: true, webSearch: !!this.#opts.grounding };
  }

  #headers(): Record<string, string> {
    return { 'x-goog-api-key': this.#opts.secrets.require(this.#opts.secretName) };
  }

  async complete(model: string, request: CompletionRequest): Promise<CompletionResponse> {
    const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = request.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body: Record<string, unknown> = {
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        ...(request.maxOutputTokens ? { maxOutputTokens: request.maxOutputTokens } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.jsonSchema ? { responseMimeType: 'application/json', responseSchema: request.jsonSchema } : {}),
      },
      ...(this.#opts.grounding ? { tools: [{ google_search: {} }] } : {}),
    };
    const res = await postJson<GenerateResponse>(`${this.#opts.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, body, this.#headers(), this.#opts.fetchOptions);
    const cand = res.candidates?.[0];
    if (!cand) throw new EvidentiaError('provider_error', 'no candidate returned', { provider: this.id });
    const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const citations = (cand.groundingMetadata?.groundingChunks ?? []).filter((c) => c.web?.uri).map((c) => ({ url: c.web?.uri as string, ...(c.web?.title ? { title: c.web.title } : {}) }));
    return {
      text,
      provider: this.id,
      model,
      ...(res.modelVersion ? { modelVersion: res.modelVersion } : {}),
      usage: { inputTokens: res.usageMetadata?.promptTokenCount ?? 0, outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0, cachedInputTokens: res.usageMetadata?.cachedContentTokenCount ?? 0 },
      finishReason: cand.finishReason === 'MAX_TOKENS' ? 'length' : cand.finishReason === 'SAFETY' ? 'content_filter' : cand.finishReason === 'STOP' ? 'stop' : 'other',
      ...(this.#opts.grounding ? { citations } : {}),
    };
  }

  async embed(model: string, request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const body = { requests: request.texts.map((t) => ({ model: `models/${model}`, content: { parts: [{ text: t }] } })) };
    const res = await postJson<EmbedResponse>(`${this.#opts.baseUrl}/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`, body, this.#headers(), this.#opts.fetchOptions);
    const vectors = (res.embeddings ?? []).map((e) => Float32Array.from(e.values));
    if (vectors.length !== request.texts.length) throw new EvidentiaError('provider_error', 'embedding count mismatch', { expected: request.texts.length, got: vectors.length });
    return { provider: this.id, model, dimensions: vectors[0]?.length ?? 0, vectors, usage: { inputTokens: request.texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0), outputTokens: 0, cachedInputTokens: 0 } };
  }
}
