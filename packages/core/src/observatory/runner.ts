import { z } from 'zod';
import type { Database } from '../storage/database.ts';
import type { AuditLedger } from '../audit/ledger.ts';
import type { PolicyAwareRouter } from '../providers/router.ts';
import { canonicalJson, newId, sha256 } from '../shared/hash.ts';
import { type Clock, systemClock } from '../shared/clock.ts';
import { EvidentiaError, notFound } from '../shared/errors.ts';
import { wilson, type Proportion } from './stats.ts';

/**
 * AI visibility observatory.
 *
 * Runs reproducible, versioned query sets against policy-allowed models through
 * official APIs (never consumer UIs), samples each prompt repeatedly because
 * answers are stochastic, and stores per-observation outcomes: brand mention,
 * citation, competitor mentions, answer position, model version, language,
 * geography, date. Reports aggregate with Wilson intervals and mark breaks in
 * series when the model version changes. Raw answer text is NOT stored by default
 * (only a hash), which keeps provider-terms and data-minimisation obligations easy.
 */

export const QuerySetSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive().default(1),
  language: z.string().default('en'),
  country: z.string().optional(),
  brand: z.object({ name: z.string().min(1), aliases: z.array(z.string()).default([]), domains: z.array(z.string()).default([]) }),
  competitors: z.array(z.object({ name: z.string().min(1), aliases: z.array(z.string()).default([]), domains: z.array(z.string()).default([]) })).default([]),
  queries: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(3),
        intent: z.enum(['informational', 'commercial', 'navigational', 'comparison', 'research', 'local']).default('informational'),
        paraphrases: z.array(z.string()).default([]),
        branded: z.boolean().default(false),
      }),
    )
    .min(1),
});
export type QuerySet = z.infer<typeof QuerySetSchema>;
export type QuerySetInput = z.input<typeof QuerySetSchema>;

export interface RunOptions {
  querySetId: string;
  models: { provider: string; model: string }[];
  samples?: number;
  /** Store raw answer text in the observation record (off by default). */
  storeRawResponses?: boolean;
  requestId?: string;
}

export interface RunSummary {
  runId: string;
  observations: number;
  denied: number;
  errors: number;
  perModel: Record<string, { observations: number; errors: number }>;
}

export interface QueryReport {
  queryId: string;
  text: string;
  intent: string;
  branded: boolean;
  provider: string;
  model: string;
  language: string;
  mention: Proportion;
  citation: Proportion;
  competitorMentions: Record<string, Proportion>;
  averagePosition: number | null;
  modelVersions: string[];
}

export interface ObservatoryReport {
  querySetId: string;
  querySetName: string;
  from: string | null;
  to: string | null;
  totalObservations: number;
  overall: { mention: Proportion; citation: Proportion };
  perModel: Record<string, { mention: Proportion; citation: Proportion; n: number }>;
  perIntent: Record<string, { mention: Proportion; citation: Proportion; n: number }>;
  queries: QueryReport[];
  seriesBreaks: { provider: string; model: string; versions: string[] }[];
  method: string;
}

interface Ctx {
  tenantId: string;
  actor: string;
  requestId?: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectMentions(text: string, names: readonly string[]): { mentioned: boolean; firstIndex: number } {
  let first = -1;
  for (const n of names) {
    if (!n) continue;
    const m = text.match(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(n)}(?![\\p{L}\\p{N}])`, 'iu'));
    if (m && m.index !== undefined && (first === -1 || m.index < first)) first = m.index;
  }
  return { mentioned: first !== -1, firstIndex: first };
}

function matchDomains(urls: Iterable<string>, domains: readonly string[]): string[] {
  const out: string[] = [];
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.replace(/^www\./, '');
      if (domains.some((d) => host === d.replace(/^www\./, '') || host.endsWith('.' + d.replace(/^www\./, ''))))
        out.push(u);
    } catch {
      /* not a URL */
    }
  }
  return out;
}

/**
 * Two distinct signals, kept separate rather than merged into one "cited" flag:
 * `toolCited` — URLs the provider's own citation/grounding mechanism returned
 * (OpenAI/Mistral `annotations`, Perplexity `citations`/`search_results`,
 * Anthropic web-search citations, Google grounding chunks) — evidence the model
 * actually retrieved and grounded on that source. `textLinked` — URLs that merely
 * appear as text in the free-form answer, which a model can fabricate without any
 * retrieval having happened. Treating the two as equivalent overstates citation
 * rates with hallucinated links; official visibility metrics use `toolCited` only.
 */
export function detectCitations(text: string, citations: readonly { url: string }[] | undefined, domains: readonly string[]): { toolCited: string[]; textLinked: string[] } {
  const toolUrls = new Set((citations ?? []).map((c) => c.url));
  const textUrls = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s)\]>"']+/g)) if (!toolUrls.has(m[0])) textUrls.add(m[0]);
  return { toolCited: matchDomains(toolUrls, domains), textLinked: matchDomains(textUrls, domains) };
}

export class Observatory {
  readonly db: Database;
  readonly ledger: AuditLedger;
  readonly router: PolicyAwareRouter;
  readonly clock: Clock;

  constructor(db: Database, ledger: AuditLedger, router: PolicyAwareRouter, clock: Clock = systemClock) {
    this.db = db;
    this.ledger = ledger;
    this.router = router;
    this.clock = clock;
  }

  saveQuerySet(ctx: Ctx, input: QuerySetInput): { id: string; querySet: QuerySet } {
    const qs = QuerySetSchema.parse(input);
    const ids = new Set(qs.queries.map((q) => q.id));
    if (ids.size !== qs.queries.length) throw new EvidentiaError('validation', 'query ids must be unique');
    const existing = this.db.raw.prepare('SELECT MAX(version) AS v FROM query_sets WHERE tenant_id = ? AND name = ?').get(ctx.tenantId, qs.name) as unknown as { v: number | null };
    const version = existing.v ? existing.v + 1 : qs.version;
    const record: QuerySet = { ...qs, version };
    const id = newId();
    this.db.raw.prepare('INSERT INTO query_sets (id, tenant_id, name, version, record, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, ctx.tenantId, qs.name, version, canonicalJson(record), this.clock.now().toISOString());
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'query_set.save', objectType: 'query_set', objectId: id, newState: { name: qs.name, version, queries: qs.queries.length } });
    return { id, querySet: record };
  }

  getQuerySet(tenantId: string, id: string): QuerySet {
    const row = this.db.raw.prepare('SELECT record FROM query_sets WHERE tenant_id = ? AND id = ?').get(tenantId, id) as unknown as { record: string } | undefined;
    if (!row) throw notFound('query_set', id);
    return QuerySetSchema.parse(JSON.parse(row.record));
  }

  listQuerySets(tenantId: string): { id: string; name: string; version: number; createdAt: string }[] {
    return (this.db.raw.prepare('SELECT id, name, version, created_at FROM query_sets WHERE tenant_id = ? ORDER BY name, version').all(tenantId) as unknown as { id: string; name: string; version: number; created_at: string }[]).map((r) => ({ id: r.id, name: r.name, version: r.version, createdAt: r.created_at }));
  }

  async run(ctx: Ctx, options: RunOptions): Promise<RunSummary> {
    const qs = this.getQuerySet(ctx.tenantId, options.querySetId);
    const samples = options.samples ?? 8;
    const runId = newId();
    const summary: RunSummary = { runId, observations: 0, denied: 0, errors: 0, perModel: {} };
    const brandNames = [qs.brand.name, ...qs.brand.aliases];
    const insert = this.db.raw.prepare(
      `INSERT INTO observations (id, tenant_id, query_set_id, query_id, provider, model, model_version, retrieval_mode, language, geography, sample_index, observed_at, response_hash, brand_mentioned, cited, citation_urls, competitor_mentions, answer_position, record)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'observatory.run_start', objectType: 'query_set', objectId: options.querySetId, ...(ctx.requestId ? { requestId: ctx.requestId } : {}), evidence: { runId, models: options.models, samples, queries: qs.queries.length } });

    modelLoop: for (const m of options.models) {
      const key = `${m.provider}/${m.model}`;
      summary.perModel[key] = { observations: 0, errors: 0 };
      for (const q of qs.queries) {
        for (const [pIndex, text] of [q.text, ...q.paraphrases].entries()) {
          for (let s = 0; s < samples; s++) {
            const requestId = `${runId}:${q.id}:${pIndex}:${s}`;
            let res;
            try {
              res = await this.router.complete({
                tenantId: ctx.tenantId, workload: 'observatory', dataClasses: ['public'], need: 'chat', preferred: key,
                request: { messages: [{ role: 'system', content: 'You are a helpful search assistant. Answer the question for a user in ' + (qs.country ?? 'Europe') + ' and cite the sources you rely on with their URLs.' }, { role: 'user', content: text }], temperature: 1, requestId },
              });
            } catch (error) {
              const e = error as EvidentiaError;
              if (e.code === 'policy_denied') {
                // A denied model is denied for every remaining sample and query too; record it
                // once and move on to the next model rather than aborting the whole run and
                // discarding observations already collected for other models.
                summary.denied += 1;
                this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'observatory.model_denied', objectType: 'query_set', objectId: options.querySetId, evidence: { runId, model: key, reason: e.message } });
                continue modelLoop;
              }
              summary.errors += 1;
              (summary.perModel[key] as { errors: number }).errors += 1;
              continue;
            }
            const mention = detectMentions(res.text, brandNames);
            const cited = detectCitations(res.text, res.citations, qs.brand.domains);
            const competitorHits: Record<string, boolean> = {};
            const positions: { name: string; index: number }[] = [];
            if (mention.mentioned) positions.push({ name: qs.brand.name, index: mention.firstIndex });
            for (const c of qs.competitors) {
              const d = detectMentions(res.text, [c.name, ...c.aliases]);
              competitorHits[c.name] = d.mentioned;
              if (d.mentioned) positions.push({ name: c.name, index: d.firstIndex });
            }
            positions.sort((a, b) => a.index - b.index);
            const position = mention.mentioned ? positions.findIndex((p) => p.name === qs.brand.name) + 1 : null;
            const record = { paraphraseIndex: pIndex, promptText: text, answerLength: res.text.length, allCitations: res.citations?.map((c) => c.url) ?? [], textLinkedCitations: cited.textLinked, attempts: res.attempts, ...(options.storeRawResponses ? { answer: res.text } : {}) };
            insert.run(newId(), ctx.tenantId, options.querySetId, q.id, res.provider, res.model, res.modelVersion ?? null, res.citations ? 'web' : 'parametric', qs.language, qs.country ?? null, s, this.clock.now().toISOString(), sha256(res.text), mention.mentioned ? 1 : 0, cited.toolCited.length ? 1 : 0, JSON.stringify(cited.toolCited), JSON.stringify(competitorHits), position, canonicalJson(record));
            summary.observations += 1;
            (summary.perModel[key] as { observations: number }).observations += 1;
          }
        }
      }
    }
    this.ledger.append({ tenantId: ctx.tenantId, actor: ctx.actor, action: 'observatory.run_end', objectType: 'query_set', objectId: options.querySetId, evidence: { ...summary } });
    return summary;
  }

  report(tenantId: string, querySetId: string, range: { from?: string; to?: string } = {}): ObservatoryReport {
    const qs = this.getQuerySet(tenantId, querySetId);
    const params: (string | number)[] = [tenantId, querySetId];
    let where = 'WHERE tenant_id = ? AND query_set_id = ?';
    if (range.from) { where += ' AND observed_at >= ?'; params.push(range.from); }
    if (range.to) { where += ' AND observed_at <= ?'; params.push(range.to); }
    const rows = this.db.raw.prepare(`SELECT query_id, provider, model, model_version, language, brand_mentioned, cited, competitor_mentions, answer_position FROM observations ${where}`).all(...params) as unknown as {
      query_id: string; provider: string; model: string; model_version: string | null; language: string; brand_mentioned: number; cited: number; competitor_mentions: string; answer_position: number | null;
    }[];
    const group = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = `${r.query_id}|${r.provider}|${r.model}|${r.language}`;
      const g = group.get(k) ?? [];
      g.push(r);
      group.set(k, g);
    }
    const queries: QueryReport[] = [];
    for (const [k, g] of group) {
      const [queryId, provider, model, language] = k.split('|') as [string, string, string, string];
      const q = qs.queries.find((x) => x.id === queryId);
      const competitorMentions: Record<string, Proportion> = {};
      for (const c of qs.competitors) competitorMentions[c.name] = wilson(g.filter((r) => (JSON.parse(r.competitor_mentions) as Record<string, boolean>)[c.name]).length, g.length);
      const positions = g.map((r) => r.answer_position).filter((p): p is number => p !== null);
      queries.push({
        queryId, text: q?.text ?? '', intent: q?.intent ?? 'informational', branded: q?.branded ?? false, provider, model, language,
        mention: wilson(g.filter((r) => r.brand_mentioned).length, g.length), citation: wilson(g.filter((r) => r.cited).length, g.length),
        competitorMentions, averagePosition: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null,
        modelVersions: [...new Set(g.map((r) => r.model_version).filter((v): v is string => !!v))],
      });
    }
    const agg = (subset: typeof rows) => ({ mention: wilson(subset.filter((r) => r.brand_mentioned).length, subset.length), citation: wilson(subset.filter((r) => r.cited).length, subset.length), n: subset.length });
    const perModel: ObservatoryReport['perModel'] = {};
    for (const key of new Set(rows.map((r) => `${r.provider}/${r.model}`))) perModel[key] = agg(rows.filter((r) => `${r.provider}/${r.model}` === key));
    const perIntent: ObservatoryReport['perIntent'] = {};
    for (const intent of new Set(qs.queries.map((q) => q.intent))) {
      const ids = new Set(qs.queries.filter((q) => q.intent === intent).map((q) => q.id));
      perIntent[intent] = agg(rows.filter((r) => ids.has(r.query_id)));
    }
    const seriesBreaks: ObservatoryReport['seriesBreaks'] = [];
    for (const key of Object.keys(perModel)) {
      const [provider, model] = key.split('/') as [string, string];
      const versions = [...new Set(rows.filter((r) => `${r.provider}/${r.model}` === key).map((r) => r.model_version).filter((v): v is string => !!v))];
      if (versions.length > 1) seriesBreaks.push({ provider, model, versions });
    }
    const times = this.db.raw.prepare(`SELECT MIN(observed_at) AS a, MAX(observed_at) AS b FROM observations ${where}`).get(...params) as unknown as { a: string | null; b: string | null };
    return {
      querySetId, querySetName: `${qs.name} v${qs.version}`, from: times.a, to: times.b, totalObservations: rows.length,
      overall: { mention: wilson(rows.filter((r) => r.brand_mentioned).length, rows.length), citation: wilson(rows.filter((r) => r.cited).length, rows.length) },
      perModel, perIntent, queries: queries.sort((a, b) => a.queryId.localeCompare(b.queryId) || a.provider.localeCompare(b.provider)), seriesBreaks,
      method: 'Repeated sampling per prompt and paraphrase through official provider APIs; rates reported with 95% Wilson score intervals; single observations are not ranking signals; series breaks marked when the model version changes.',
    };
  }
}
