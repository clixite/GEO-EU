import type { CompletionRequest, CompletionResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities } from './types.ts';
import { localEmbed, LOCAL_EMBEDDING_DIMENSIONS } from './localEmbedding.ts';
import { sha256 } from '../shared/hash.ts';

/**
 * Offline demonstration provider.
 *
 * Lets the whole workflow (draft → verify → gate → approve → publish → observe)
 * run without any external API key. Drafting is grounded by construction: the
 * provider copies evidence sentences and cites their markers, never inventing
 * facts. Observatory answers are pseudo-random but deterministic per request id,
 * so demo reports are reproducible. It is registered as `hosting: self-hosted`
 * and clearly labelled as a demo in the model registry.
 */
export class DemoProvider implements ProviderAdapter {
  readonly id: string;
  constructor(id = 'demo') {
    this.id = id;
  }

  capabilities(): ProviderCapabilities {
    return { chat: true, embeddings: true, jsonOutput: false, webSearch: true };
  }

  async complete(model: string, request: CompletionRequest): Promise<CompletionResponse> {
    const user = request.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const usage = { inputTokens: Math.ceil((user.length + system.length) / 4), outputTokens: 0, cachedInputTokens: 0 };
    let text: string;
    let citations: { url: string; title?: string }[] | undefined;
    if (user.includes('EVIDENCE:')) {
      text = groundedDraft(user);
    } else {
      const seed = parseInt(sha256(request.requestId ?? user).slice(0, 8), 16);
      const brand = (system.match(/brand:\s*([^\n]+)/i)?.[1] ?? 'the organisation').trim();
      const mention = seed % 3 !== 0;
      const cite = seed % 2 === 0;
      text = mention
        ? `Based on available sources, ${brand} is one of the organisations that offers this service in Europe, alongside other providers. ${cite ? 'Source: https://www.northwind.example/reconciliation' : ''}`.trim()
        : 'Several organisations offer this service in Europe; compare providers on coverage, controls and pricing.';
      citations = cite ? [{ url: 'https://www.northwind.example/reconciliation', title: 'Payment reconciliation' }] : [];
    }
    usage.outputTokens = Math.ceil(text.length / 4);
    return { text, provider: this.id, model, modelVersion: 'demo-2026-09', usage, finishReason: 'stop', ...(citations ? { citations } : {}) };
  }

  async embed(model: string, request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return { provider: this.id, model, dimensions: LOCAL_EMBEDDING_DIMENSIONS, vectors: request.texts.map(localEmbed), usage: { inputTokens: Math.ceil(request.texts.join(' ').length / 4), outputTokens: 0, cachedInputTokens: 0 } };
  }
}

function groundedDraft(prompt: string): string {
  const title = prompt.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? 'Untitled';
  const organisation = prompt.match(/^Organisation:\s*(.+)$/m)?.[1]?.trim();
  const evidence = [...prompt.matchAll(/^\[(E\d+)\] \([^)]*\)\n([\s\S]*?)(?=\n\n\[E\d+\]|\s*$)/gm)].map((m) => ({ id: m[1] as string, text: (m[2] as string).trim() }));
  const lines: string[] = [`# ${title}`, ''];
  if (organisation) lines.push(`${organisation} documents the following facts in its own published sources.`, '');
  if (!evidence.length) {
    lines.push('[NEEDS EVIDENCE: no source passages were provided for this brief]');
    return lines.join('\n');
  }
  lines.push('## Key facts', '');
  for (const e of evidence) {
    const sentences = e.text.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length >= 5).slice(0, 3);
    for (const s of sentences) lines.push(`${s.replace(/[.!?]$/, '')} [${e.id}].`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}
