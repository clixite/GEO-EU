import { createHash } from 'node:crypto';
import type { EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities, CompletionRequest, CompletionResponse } from './types.ts';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * Deterministic local embedding by feature hashing of word uni- and bi-grams.
 *
 * This is NOT a semantic embedding. It gives a stable, offline, dependency-free
 * vector space so that hybrid retrieval, tests, demos and air-gapped deployments
 * work without a model provider. Production deployments should register a real
 * embedding model; the retrieval layer treats both identically.
 */
export const LOCAL_EMBEDDING_DIMENSIONS = 384;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

function bucket(feature: string): { index: number; sign: 1 | -1 } {
  const h = createHash('sha1').update(feature).digest();
  const index = h.readUInt32BE(0) % LOCAL_EMBEDDING_DIMENSIONS;
  const sign: 1 | -1 = (h[4] ?? 0) & 1 ? 1 : -1;
  return { index, sign };
}

export function localEmbed(text: string): Float32Array {
  const v = new Float32Array(LOCAL_EMBEDDING_DIMENSIONS);
  const tokens = tokenize(text);
  const add = (feature: string, weight: number) => {
    const { index, sign } = bucket(feature);
    v[index] = (v[index] ?? 0) + sign * weight;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as string;
    add('u:' + t, 1);
    if (i + 1 < tokens.length) add('b:' + t + '_' + tokens[i + 1], 0.5);
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / norm;
  return v;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new EvidentiaError('validation', 'vector dimension mismatch', { a: a.length, b: b.length });
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export class LocalEmbeddingProvider implements ProviderAdapter {
  readonly id = 'local';

  capabilities(): ProviderCapabilities {
    return { chat: false, embeddings: true, jsonOutput: false, webSearch: false };
  }

  async complete(_model: string, _request: CompletionRequest): Promise<CompletionResponse> {
    throw new EvidentiaError('unsupported', 'local provider does not support chat completions');
  }

  async embed(model: string, request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const vectors = request.texts.map(localEmbed);
    const inputTokens = request.texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0);
    return { provider: this.id, model, dimensions: LOCAL_EMBEDDING_DIMENSIONS, vectors, usage: { inputTokens, outputTokens: 0, cachedInputTokens: 0 } };
  }
}
