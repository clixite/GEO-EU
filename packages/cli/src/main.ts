import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import {
  analyzePage, recommendations, safeFetch, evaluateModelAccess, Dataset, runDataset, buildGroundedPrompt, evidenceFromHits, StaticExportAdapter, WordPressAdapter, GenericHttpAdapter,
  envSecrets, applyRetention, exportTenant, eraseTenant, EvidentiaError, isEvidentiaError, localEmbed, type ReadinessReport, type DataClass, type ModelRecordInput, type AiSystemRecordInput, type ProcessingRecordInput, type QuerySetInput, type EvalReport,
} from '@evidentia/core';
import { createRuntime, DEFAULT_POLICY, REPO_ROOT, loadSigningKey, type Runtime } from './runtime.ts';

/**
 * `evidentia` — command-line interface used by operators, CI pipelines and the
 * Evidentia Agent Skill. Every command is deterministic given the same store,
 * prints human-readable output by default and JSON with --json.
 */

const VERSION = '1.0.0';

interface Parsed {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): Parsed {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else flags[key] = true;
    } else positionals.push(a);
  }
  return { positionals, flags };
}

const str = (flags: Parsed['flags'], key: string, fallback?: string): string | undefined => (typeof flags[key] === 'string' ? (flags[key] as string) : fallback);
const bool = (flags: Parsed['flags'], key: string): boolean => flags[key] === true || flags[key] === 'true';
const num = (flags: Parsed['flags'], key: string, fallback: number): number => (typeof flags[key] === 'string' ? Number(flags[key]) : fallback);
const list = (flags: Parsed['flags'], key: string): string[] => (str(flags, key) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

class Output {
  readonly json: boolean;
  readonly write: (s: string) => void;
  constructor(json: boolean, write: (s: string) => void = (s) => process.stdout.write(s)) {
    this.json = json;
    this.write = write;
  }
  emit(value: unknown, human?: () => string): void {
    if (this.json) this.write(JSON.stringify(value, null, 2) + '\n');
    else this.write((human ? human() : render(value)) + '\n');
  }
}

function render(value: unknown, indent = ''): string {
  if (value === null || value === undefined) return `${indent}—`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${indent}(none)`;
    if (value.every((v) => v && typeof v === 'object' && !Array.isArray(v))) return table(value as Record<string, unknown>[], indent);
    return value.map((v) => render(v, indent + '  ')).join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => (v && typeof v === 'object' ? `${indent}${k}:\n${render(v, indent + '  ')}` : `${indent}${k}: ${String(v)}`))
      .join('\n');
  }
  return `${indent}${String(value)}`;
}

function table(rows: Record<string, unknown>[], indent = ''): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => rows.some((r) => r[c] !== undefined && typeof r[c] !== 'object'));
  const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v)).slice(0, 60);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const line = (vals: string[]) => indent + vals.map((v, i) => v.padEnd(widths[i] as number)).join('  ');
  return [line(cols), line(widths.map((w) => '-'.repeat(w))), ...rows.map((r) => line(cols.map((c) => cell(r[c]))))].join('\n');
}

function readInput(flags: Parsed['flags']): { content: string; kind: 'file' | 'stdin' | 'text' } {
  const file = str(flags, 'file');
  if (file) return { content: readFileSync(resolve(file), 'utf8'), kind: 'file' };
  const text = str(flags, 'text');
  if (text) return { content: text, kind: 'text' };
  return { content: readFileSync(0, 'utf8'), kind: 'stdin' };
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
}

async function fetchPage(url: string): Promise<{ html: string; robotsTxt: string | null; headers: Record<string, string>; llmsTxtPresent: boolean }> {
  const page = await safeFetch(url, { maxBytes: 8 * 1024 * 1024 });
  const origin = new URL(url).origin;
  let robotsTxt: string | null = null;
  try {
    const r = await safeFetch(`${origin}/robots.txt`, { maxBytes: 512 * 1024 });
    robotsTxt = r.status === 200 ? new TextDecoder().decode(r.body) : null;
  } catch { robotsTxt = null; }
  let llmsTxtPresent = false;
  try {
    const l = await safeFetch(`${origin}/llms.txt`, { maxBytes: 256 * 1024 });
    llmsTxtPresent = l.status === 200 && (l.contentType ?? '').includes('text');
  } catch { llmsTxtPresent = false; }
  const headers: Record<string, string> = {};
  page.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return { html: new TextDecoder().decode(page.body), robotsTxt, headers, llmsTxtPresent };
}

function readinessHuman(r: ReadinessReport): string {
  const lines = [
    `Evidentia readiness ${r.version} — ${r.url}`,
    `Score: ${r.score}/100 (deterministic ${r.deterministicScore}, penalties ${r.penalties}, quality ${r.qualityAssessed ? 'judged' : 'not assessed'})`,
    r.blockedSearchEngines.length ? `BLOCKED for: ${r.blockedSearchEngines.join(', ')}` : 'All documented AI search agents allowed (or robots.txt not provided).',
    '',
    'Dimensions:',
    ...r.dimensions.map((d) => `  ${d.dimension.padEnd(15)} ${d.points.toFixed(1).padStart(5)} / ${d.maxPoints}`),
    '',
    'Checks:',
    ...r.checks.map((c) => `  [${c.status.padEnd(4)}] ${c.id.padEnd(3)} ${c.tier.padEnd(13)} ${c.title} — ${c.evidence}`),
    '',
    'Top recommendations:',
    ...recommendations(r).slice(0, 8).map((x, i) => `  ${i + 1}. (${x.atStake} pts) ${x.title}: ${x.recommendation}`),
  ];
  return lines.join('\n');
}

type Command = (rt: Runtime, p: Parsed, out: Output) => Promise<number> | number;

const commands: Record<string, Command> = {
  async init(rt, p, out) {
    if (!rt.registry.find(rt.ctx.tenantId, 'local', 'hash-384')) {
      rt.registry.upsert(rt.ctx, { provider: 'local', model: 'hash-384', displayName: 'Local hashed embeddings (offline, non-semantic)', adapter: 'local', hosting: 'self-hosted', modalities: ['embedding'], dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true }, allowedDataClasses: ['public', 'internal', 'confidential', 'personal', 'special-category'], approvalStatus: 'approved', evaluationStatus: 'passed', qualityTier: 1, latencyTier: 1, riskNotes: 'Deterministic feature-hashing embedding; no data leaves the host.' });
    }
    const key = loadSigningKey(rt.options.signingKeyPath, true);
    out.emit({ db: rt.options.dbPath, tenant: rt.ctx.tenantId, policy: rt.policy.id, models: rt.registry.list(rt.ctx.tenantId).length, signingKey: key ? key.keyId : null, ledger: rt.ledger.verify() });
    return 0;
  },
  status(rt, _p, out) {
    out.emit({ tenant: rt.ctx.tenantId, policy: `${rt.policy.id} v${rt.policy.version}`, knowledge: rt.store.stats(rt.ctx.tenantId), quarantined: rt.store.quarantined(rt.ctx.tenantId).length, models: rt.registry.list(rt.ctx.tenantId).map((m) => `${m.record.provider}/${m.record.model} (${m.record.approvalStatus}, ${m.record.hosting})`), aiSystems: rt.systems.list(rt.ctx.tenantId).length, overdueReviews: rt.systems.overdueReviews(rt.ctx.tenantId).length, pendingApprovals: rt.approvals.listPending(rt.ctx.tenantId).length, drafts: rt.pipeline.list(rt.ctx.tenantId).length, cost30d: rt.meter.summary(rt.ctx.tenantId, new Date(Date.now() - 30 * 86_400_000).toISOString()), ledger: rt.ledger.verify() });
    return 0;
  },
  version(_rt, _p, out) {
    out.emit({ evidentia: VERSION, node: process.versions.node });
    return 0;
  },
  async analyze(rt, p, out) {
    const target = p.positionals[1];
    if (!target) throw new EvidentiaError('validation', 'usage: analyze <url|file> [--robots file] [--brand name] [--out file]');
    let input: { url: string; html: string; robotsTxt?: string | null; httpHeaders?: Record<string, string>; llmsTxtPresent?: boolean };
    if (/^https?:\/\//.test(target)) {
      const f = await fetchPage(target);
      input = { url: target, html: f.html, robotsTxt: f.robotsTxt, httpHeaders: f.headers, llmsTxtPresent: f.llmsTxtPresent };
    } else {
      input = { url: str(p.flags, 'url', 'https://example.invalid/local-file') as string, html: readFileSync(resolve(target), 'utf8') };
    }
    const robotsFile = str(p.flags, 'robots');
    if (robotsFile) input.robotsTxt = readFileSync(resolve(robotsFile), 'utf8');
    const brand = str(p.flags, 'brand');
    const report = analyzePage({ ...input, ...(brand ? { brand: { name: brand } } : {}) });
    rt.ledger.append({ tenantId: rt.ctx.tenantId, actor: rt.ctx.actor, action: 'readiness.analyze', objectType: 'url', objectId: report.url, evidence: { score: report.score, deterministicScore: report.deterministicScore, penalties: report.penalties, version: report.version } });
    const outFile = str(p.flags, 'out');
    if (outFile) writeFileSync(resolve(outFile), JSON.stringify(report, null, 2));
    out.emit(report, () => readinessHuman(report));
    return 0;
  },
  async source(rt, p, out) {
    const sub = p.positionals[1];
    if (sub === 'add') {
      const locator = p.positionals[2];
      if (!locator) throw new EvidentiaError('validation', 'usage: source add <locator> [--kind url|file|manual|api] [--authority official|internal|third-party|unverified] [--owner] [--title] [--licence] [--language]');
      const kind = (str(p.flags, 'kind') ?? (/^https?:\/\//.test(locator) ? 'url' : 'file')) as 'url' | 'file' | 'manual' | 'api';
      const authority = str(p.flags, 'authority');
      const s = rt.store.addSource(rt.ctx, { kind, locator, ...(authority ? { authorityLevel: authority as 'official' } : {}), ...(str(p.flags, 'owner') ? { owner: str(p.flags, 'owner') as string } : {}), ...(str(p.flags, 'title') ? { title: str(p.flags, 'title') as string } : {}), ...(str(p.flags, 'licence') ? { licence: str(p.flags, 'licence') as string } : {}), ...(str(p.flags, 'language') ? { language: str(p.flags, 'language') as string } : {}) });
      out.emit(s);
      return 0;
    }
    if (sub === 'list') { out.emit(rt.store.listSources(rt.ctx.tenantId).map((s) => ({ id: s.id, kind: s.kind, authority: s.authorityLevel, locator: s.locator, owner: s.owner, documents: rt.store.listDocuments(rt.ctx.tenantId, s.id).length }))); return 0; }
    if (sub === 'delete') {
      const id = p.positionals[2];
      const reason = str(p.flags, 'reason');
      if (!id || !reason) throw new EvidentiaError('validation', 'usage: source delete <id> --reason <text>');
      rt.store.deleteSource(rt.ctx, id, reason);
      out.emit({ deleted: id });
      return 0;
    }
    throw new EvidentiaError('validation', 'usage: source add|list|delete');
  },
  async ingest(rt, p, out) {
    const url = str(p.flags, 'url');
    let sourceId = p.positionals[1];
    let content: string;
    let contentType: 'text/html' | 'text/markdown' | 'text/plain' | undefined = str(p.flags, 'type') as 'text/html' | undefined;
    let fetchedAt: string | undefined;
    if (url) {
      const res = await safeFetch(url, { maxBytes: 8 * 1024 * 1024 });
      if (res.status !== 200) throw new EvidentiaError('provider_error', `fetch returned ${res.status}`, { url });
      content = new TextDecoder().decode(res.body);
      contentType ??= (res.contentType ?? '').includes('html') ? 'text/html' : (res.contentType ?? '').includes('markdown') ? 'text/markdown' : 'text/plain';
      fetchedAt = new Date().toISOString();
      if (!sourceId) sourceId = rt.store.addSource(rt.ctx, { kind: 'url', locator: url, authorityLevel: (str(p.flags, 'authority') ?? 'internal') as 'internal' }).id;
    } else {
      if (!sourceId) throw new EvidentiaError('validation', 'usage: ingest <sourceId> (--file <path> | --text <text> | stdin) [--type html|markdown|text]  or  ingest --url <url> [--authority official]');
      const input = readInput(p.flags);
      content = input.content;
      const file = str(p.flags, 'file') ?? '';
      contentType ??= /\.html?$/i.test(file) ? 'text/html' : /\.md$/i.test(file) ? 'text/markdown' : /<\s*html/i.test(content) ? 'text/html' : 'text/plain';
    }
    if (contentType && !contentType.startsWith('text/')) contentType = `text/${contentType}` as 'text/html';
    const r = await rt.store.ingest(rt.ctx, { sourceId: sourceId as string, content, ...(contentType ? { contentType } : {}), ...(fetchedAt ? { fetchedAt } : {}) });
    out.emit(r);
    return r.quarantined ? 5 : 0;
  },
  async search(rt, p, out) {
    const query = p.positionals.slice(1).join(' ');
    if (!query) throw new EvidentiaError('validation', 'usage: search <query> [--k 8] [--include-quarantined] [--decompose]');
    const hits = await rt.retriever.search(rt.ctx.tenantId, query, { k: num(p.flags, 'k', 8), decompose: bool(p.flags, 'decompose'), filters: { includeQuarantined: bool(p.flags, 'include-quarantined') }, embedQuery: async (q) => (await rt.router.embed({ tenantId: rt.ctx.tenantId, workload: 'search', dataClasses: ['internal'], need: 'embeddings', texts: [q] })).vectors[0] ?? localEmbed(q) });
    out.emit(hits, () => hits.map((h, i) => `${i + 1}. [${h.score.toFixed(3)}] ${h.documentTitle ?? h.locator}${h.headingPath ? ' › ' + h.headingPath : ''} (${h.authorityLevel}; ${h.locator}#${h.charStart}-${h.charEnd})\n   ${h.text.slice(0, 240).replace(/\s+/g, ' ')}…`).join('\n'));
    return 0;
  },
  claims(rt, p, out) {
    out.emit(rt.store.listClaims(rt.ctx.tenantId, str(p.flags, 'document')).map((c) => ({ kind: c.kind, confidence: c.confidence, entities: c.entities.join(', '), text: c.text })));
    return 0;
  },
  entities(rt, _p, out) {
    out.emit(rt.store.listEntities(rt.ctx.tenantId).map((e) => ({ canonical: e.canonical, kind: e.kind, mentions: e.mentions, aliases: e.aliases.join(' | ') })));
    return 0;
  },
  quarantine(rt, p, out) {
    const sub = p.positionals[1];
    if (sub === 'list' || !sub) { out.emit(rt.store.quarantined(rt.ctx.tenantId).map((d) => ({ id: d.id, title: d.title, reason: (d.metadata?.['quarantineReason'] as string[] | undefined)?.join(', ') }))); return 0; }
    const id = p.positionals[2];
    const note = str(p.flags, 'note');
    if ((sub !== 'release' && sub !== 'hold') || !id || !note) throw new EvidentiaError('validation', 'usage: quarantine list | quarantine release <documentId> --note <text> | quarantine hold <documentId> --note <text>');
    rt.store.setQuarantine(rt.ctx, id, sub === 'hold', note);
    out.emit({ id, quarantine: sub === 'hold' });
    return 0;
  },
  dsar(rt, p, out) {
    const sub = p.positionals[1];
    const term = p.positionals[2];
    if (sub === 'find' && term) { out.emit(rt.store.findTerm(rt.ctx.tenantId, term)); return 0; }
    if (sub === 'redact' && term) {
      const reason = str(p.flags, 'reason');
      if (!reason) throw new EvidentiaError('validation', 'usage: dsar redact <term> --replacement <text> --reason <text>');
      out.emit(rt.store.redactTerm(rt.ctx, term, str(p.flags, 'replacement', '[redacted]') as string, reason));
      return 0;
    }
    throw new EvidentiaError('validation', 'usage: dsar find <term> | dsar redact <term> --replacement <text> --reason <text>');
  },
  model(rt, p, out) {
    const sub = p.positionals[1];
    if (sub === 'register') {
      const file = str(p.flags, 'file');
      if (!file) throw new EvidentiaError('validation', 'usage: model register --file <model.json>');
      const input = readJsonFile<ModelRecordInput | ModelRecordInput[]>(file);
      const results = (Array.isArray(input) ? input : [input]).map((m) => rt.registry.upsert(rt.ctx, m));
      out.emit(results.map((r) => ({ id: r.id, model: `${r.record.provider}/${r.record.model}`, status: r.record.approvalStatus, hosting: r.record.hosting })));
      return 0;
    }
    if (sub === 'list') { out.emit(rt.registry.list(rt.ctx.tenantId).map((m) => ({ id: m.id, model: `${m.record.provider}/${m.record.model}`, adapter: m.record.adapter, hosting: m.record.hosting, training: m.record.dataPolicy.usedForTraining, dpa: m.record.dataPolicy.dpaAvailable, zdr: m.record.dataPolicy.zeroDataRetention, classes: m.record.allowedDataClasses.join(','), status: m.record.approvalStatus }))); return 0; }
    if (sub === 'status') {
      const id = p.positionals[2];
      const status = p.positionals[3] as 'approved' | 'suspended' | 'retired' | 'draft' | undefined;
      if (!id || !status) throw new EvidentiaError('validation', 'usage: model status <id> <approved|suspended|retired|draft> [--note text]');
      out.emit(rt.registry.setApprovalStatus(rt.ctx, id, status, str(p.flags, 'note')));
      return 0;
    }
    throw new EvidentiaError('validation', 'usage: model register|list|status');
  },
  system(rt, p, out) {
    const sub = p.positionals[1];
    if (sub === 'register') {
      const file = str(p.flags, 'file');
      if (!file) throw new EvidentiaError('validation', 'usage: system register --file <system.json>');
      out.emit(rt.systems.upsert(rt.ctx, readJsonFile<AiSystemRecordInput>(file)));
      return 0;
    }
    if (sub === 'list') { out.emit(rt.systems.list(rt.ctx.tenantId).map((s) => ({ id: s.id, name: s.record.name, role: s.record.deploymentRole, risk: s.record.riskClassification, art50: s.record.article50Applicable, model: `${s.record.provider}/${s.record.model}`, review: s.record.reviewDate, status: s.record.status }))); return 0; }
    throw new EvidentiaError('validation', 'usage: system register|list');
  },
  processing(rt, p, out) {
    const sub = p.positionals[1];
    if (sub === 'register') {
      const file = str(p.flags, 'file');
      if (!file) throw new EvidentiaError('validation', 'usage: processing register --file <record.json>');
      out.emit(rt.processing.create(rt.ctx, readJsonFile<ProcessingRecordInput>(file)));
      return 0;
    }
    if (sub === 'list') { out.emit(rt.processing.list(rt.ctx.tenantId).map((r) => ({ id: r.id, purpose: r.record.purpose, basis: r.record.legalBasis, role: r.record.role, retentionDays: r.record.retentionDays, dpia: r.record.dpiaRequired }))); return 0; }
    throw new EvidentiaError('validation', 'usage: processing register|list');
  },
  policy(rt, p, out) {
    const sub = p.positionals[1];
    if (sub === 'show' || !sub) { out.emit(rt.policy); return 0; }
    if (sub === 'check') {
      const provider = str(p.flags, 'provider');
      const model = str(p.flags, 'model');
      const classes = list(p.flags, 'classes') as DataClass[];
      if (!provider || !model || !classes.length) throw new EvidentiaError('validation', 'usage: policy check --provider <p> --model <m> --classes public,internal');
      const rec = rt.registry.find(rt.ctx.tenantId, provider, model);
      if (!rec) throw new EvidentiaError('not_found', 'model not registered', { provider, model });
      out.emit(evaluateModelAccess(rt.policy, rec.record, classes));
      return 0;
    }
    throw new EvidentiaError('validation', 'usage: policy show | policy check');
  },
  async draft(rt, p, out) {
    const sub = p.positionals[1];
    const id = p.positionals[2];
    const editorial = () => {
      const name = str(p.flags, 'editor');
      const role = str(p.flags, 'role');
      if (!name || !role) throw new EvidentiaError('validation', '--editor <name> and --role <role> are required (named editorial responsibility)');
      return { name, role };
    };
    switch (sub) {
      case 'create': {
        const title = str(p.flags, 'title');
        const slug = str(p.flags, 'slug');
        if (!title || !slug) throw new EvidentiaError('validation', 'usage: draft create --title <t> --slug <s> (--file <md> | stdin) [--ai-assisted] [--model provider/model] [--evidence-query <q>] [--topics a,b]');
        const body = readInput(p.flags).content;
        const q = str(p.flags, 'evidence-query');
        const evidence = q ? evidenceFromHits(await rt.retriever.search(rt.ctx.tenantId, q, { k: num(p.flags, 'k', 6) })) : [];
        const d = rt.pipeline.createDraft(rt.ctx, { title, slug, body, aiAssisted: bool(p.flags, 'ai-assisted'), ...(str(p.flags, 'model') ? { modelId: str(p.flags, 'model') as string } : {}), evidence, topics: list(p.flags, 'topics'), author: rt.ctx.actor, ...(str(p.flags, 'language') ? { language: str(p.flags, 'language') as string } : {}) });
        out.emit({ id: d.id, status: d.status, evidence: d.evidence.length });
        return 0;
      }
      case 'generate': {
        const title = str(p.flags, 'title');
        const slug = str(p.flags, 'slug');
        const query = str(p.flags, 'query');
        if (!title || !slug || !query) throw new EvidentiaError('validation', 'usage: draft generate --title <t> --slug <s> --query <evidence query> [--audience] [--intent] [--outline "a|b"] [--classes internal] [--max-words 800] [--topics a,b]');
        const classes = (list(p.flags, 'classes').length ? list(p.flags, 'classes') : ['internal']) as DataClass[];
        const hits = await rt.retriever.search(rt.ctx.tenantId, query, { k: num(p.flags, 'k', 6), decompose: true, embedQuery: async (q) => (await rt.router.embed({ tenantId: rt.ctx.tenantId, workload: 'search', dataClasses: classes, need: 'embeddings', texts: [q] })).vectors[0] ?? localEmbed(q) });
        const evidence = evidenceFromHits(hits);
        const messages = buildGroundedPrompt({ title, audience: str(p.flags, 'audience', 'general professional audience') as string, intent: str(p.flags, 'intent', 'inform') as string, ...(str(p.flags, 'outline') ? { outline: (str(p.flags, 'outline') as string).split('|') } : {}), ...(str(p.flags, 'brand') ? { brand: str(p.flags, 'brand') as string } : {}), maxWords: num(p.flags, 'max-words', 800) }, evidence);
        const res = await rt.router.complete({ tenantId: rt.ctx.tenantId, workload: 'drafting', dataClasses: classes, need: 'chat', strategy: (str(p.flags, 'strategy') as 'quality' | undefined) ?? 'quality', ...(str(p.flags, 'model') ? { preferred: str(p.flags, 'model') as string } : {}), request: { messages, temperature: 0.2 } });
        let d = rt.pipeline.createDraft(rt.ctx, { title, slug, body: res.text, aiAssisted: true, modelId: `${res.provider}/${res.model}`, evidence, topics: list(p.flags, 'topics'), author: rt.ctx.actor });
        d = rt.pipeline.verify(rt.ctx, d.id);
        out.emit({ id: d.id, status: d.status, model: d.modelId, evidence: d.evidence.length, verification: d.verification && { materialClaims: d.verification.materialClaims, unsupportedClaims: d.verification.unsupportedClaims, evidenceCoverage: d.verification.evidenceCoverage, placeholders: d.verification.placeholders.length }, usage: res.usage, body: res.text });
        return 0;
      }
      case 'list': { out.emit(rt.pipeline.list(rt.ctx.tenantId, str(p.flags, 'status') as 'draft' | undefined).map((d) => ({ id: d.id, status: d.status, title: d.title, slug: d.slug, ai: d.aiAssisted, coverage: d.verification?.evidenceCoverage ?? null, unsupported: d.verification?.unsupportedClaims ?? null, updated: d.updatedAt }))); return 0; }
      case 'show': { if (!id) throw new EvidentiaError('validation', 'usage: draft show <id>'); const d = rt.pipeline.get(rt.ctx.tenantId, id); out.emit(d, () => `${d.title} [${d.status}] (${d.slug})\nAI-assisted: ${d.aiAssisted}${d.modelId ? ' via ' + d.modelId : ''}\nEvidence: ${d.evidence.length} passage(s)\n${d.verification ? `Verification: ${d.verification.supportedClaims}/${d.verification.materialClaims} claims supported, ${d.verification.placeholders.length} placeholder(s)\n` : ''}${d.gate ? `Gate: ${d.gate.effect} — ${d.gate.reasons.concat(d.gate.blockers).join('; ')}\n` : ''}\n${d.body}`); return 0; }
      case 'verify': { if (!id) throw new EvidentiaError('validation', 'usage: draft verify <id>'); const d = rt.pipeline.verify(rt.ctx, id); out.emit({ id: d.id, status: d.status, verification: d.verification }, () => `${d.status}: ${d.verification?.supportedClaims}/${d.verification?.materialClaims} claims supported (coverage ${d.verification?.evidenceCoverage.toFixed(2)}), ${d.verification?.placeholders.length} placeholder(s)\n` + (d.verification?.claims.filter((c) => !c.supported).map((c) => `  ✗ ${c.text}\n    ${c.reason}`).join('\n') ?? '')); return d.verification?.unsupportedClaims ? 6 : 0; }
      case 'gate': { if (!id) throw new EvidentiaError('validation', 'usage: draft gate <id>'); const d = rt.pipeline.gate(rt.ctx, id); out.emit({ id: d.id, status: d.status, gate: d.gate, approvalId: d.approvalId }, () => `${d.status} — ${d.gate?.effect}: ${(d.gate?.reasons ?? []).concat(d.gate?.blockers ?? []).join('; ') || 'no conditions'}${d.approvalId ? `\napproval id: ${d.approvalId}` : ''}`); return d.status === 'blocked' ? 6 : 0; }
      case 'approve':
      case 'reject': { if (!id) throw new EvidentiaError('validation', `usage: draft ${sub} <id> [--note text]`); const d = rt.pipeline.decide(rt.ctx, id, sub === 'approve' ? 'approved' : 'rejected', str(p.flags, 'note')); out.emit({ id: d.id, status: d.status, reviewer: d.reviewer }); return 0; }
      case 'preview': { if (!id) throw new EvidentiaError('validation', 'usage: draft preview <id> --out <file.html> --editor <name> --role <role>'); const d = rt.pipeline.get(rt.ctx.tenantId, id); const art = rt.pipeline.render(d, editorial()); const outFile = str(p.flags, 'out'); if (outFile) writeFileSync(resolve(outFile), art.html); out.emit({ id: d.id, html: outFile ?? art.html.length, manifest: art.manifest?.keyId ?? null }, () => outFile ? `written ${outFile}` : art.html); return 0; }
      case 'publish': {
        if (!id) throw new EvidentiaError('validation', 'usage: draft publish <id> --target static:<dir>|wordpress:<baseUrl>|http:<url> --editor <name> --role <role>');
        const target = str(p.flags, 'target');
        if (!target) throw new EvidentiaError('validation', '--target is required (static:<dir> | wordpress:<baseUrl> | http:<url>)');
        const secrets = envSecrets();
        let adapterId: string;
        if (target.startsWith('static:')) { const a = new StaticExportAdapter(resolve(target.slice(7))); rt.pipeline.adapters.set(a.id, a); adapterId = a.id; }
        else if (target.startsWith('wordpress:')) { const a = new WordPressAdapter({ baseUrl: target.slice(10), secretName: 'EVIDENTIA_PUBLISH_WORDPRESS', secrets }); rt.pipeline.adapters.set(a.id, a); adapterId = a.id; }
        else if (target.startsWith('http:')) { const a = new GenericHttpAdapter({ url: target.slice(5), secretName: 'EVIDENTIA_PUBLISH_HTTP_SECRET', secrets }); rt.pipeline.adapters.set(a.id, a); adapterId = a.id; }
        else throw new EvidentiaError('validation', 'unknown target scheme');
        const { draft: d, receipt } = await rt.pipeline.publish(rt.ctx, id, adapterId, editorial());
        out.emit({ id: d.id, status: d.status, publishedAt: d.publishedAt, receipt });
        return 0;
      }
      default:
        throw new EvidentiaError('validation', 'usage: draft create|generate|list|show|verify|gate|approve|reject|preview|publish');
    }
  },
  approvals(rt, _p, out) {
    out.emit(rt.approvals.listPending(rt.ctx.tenantId).map((a) => ({ id: a.id, action: a.action, object: `${a.objectType}/${a.objectId}`, requestedBy: a.requestedBy, requestedAt: a.requestedAt, reason: a.reason })));
    return 0;
  },
  async observe(rt, p, out) {
    const sub = p.positionals[1];
    if (sub === 'save') {
      const file = str(p.flags, 'file');
      if (!file) throw new EvidentiaError('validation', 'usage: observe save --file <query-set.json>');
      const r = rt.observatory.saveQuerySet(rt.ctx, readJsonFile<QuerySetInput>(file));
      out.emit({ id: r.id, name: r.querySet.name, version: r.querySet.version, queries: r.querySet.queries.length });
      return 0;
    }
    if (sub === 'list') { out.emit(rt.observatory.listQuerySets(rt.ctx.tenantId)); return 0; }
    if (sub === 'run') {
      const qs = p.positionals[2];
      const models = list(p.flags, 'models').map((m) => { const [provider, model] = m.split('/'); return { provider: provider as string, model: model as string }; });
      if (!qs || !models.length) throw new EvidentiaError('validation', 'usage: observe run <querySetId> --models provider/model[,provider/model] [--samples 8] [--store-raw]');
      const summary = await rt.observatory.run(rt.ctx, { querySetId: qs, models, samples: num(p.flags, 'samples', 8), storeRawResponses: bool(p.flags, 'store-raw') });
      out.emit(summary);
      return 0;
    }
    if (sub === 'report') {
      const qs = p.positionals[2];
      if (!qs) throw new EvidentiaError('validation', 'usage: observe report <querySetId> [--from iso] [--to iso] [--out file]');
      const report = rt.observatory.report(rt.ctx.tenantId, qs, { ...(str(p.flags, 'from') ? { from: str(p.flags, 'from') as string } : {}), ...(str(p.flags, 'to') ? { to: str(p.flags, 'to') as string } : {}) });
      const outFile = str(p.flags, 'out');
      if (outFile) writeFileSync(resolve(outFile), JSON.stringify(report, null, 2));
      const pct = (x: { p: number; low: number; high: number; n: number }) => `${(x.p * 100).toFixed(0)}% [${(x.low * 100).toFixed(0)}–${(x.high * 100).toFixed(0)}] n=${x.n}`;
      out.emit(report, () => [`${report.querySetName} — ${report.totalObservations} observations (${report.from ?? '–'} → ${report.to ?? '–'})`, `Overall mention ${pct(report.overall.mention)}, citation ${pct(report.overall.citation)}`, '', 'Per model:', ...Object.entries(report.perModel).map(([k, v]) => `  ${k}: mention ${pct(v.mention)}, citation ${pct(v.citation)}`), '', 'Per query:', ...report.queries.map((q) => `  ${q.queryId} (${q.intent}${q.branded ? ', branded' : ''}) ${q.provider}/${q.model}: mention ${pct(q.mention)}, citation ${pct(q.citation)}${q.averagePosition ? `, avg position ${q.averagePosition.toFixed(1)}` : ''}`), ...(report.seriesBreaks.length ? ['', 'Series breaks (model version changed): ' + report.seriesBreaks.map((b) => `${b.provider}/${b.model}: ${b.versions.join(' → ')}`).join('; ')] : []), '', report.method].join('\n'));
      return 0;
    }
    throw new EvidentiaError('validation', 'usage: observe save|list|run|report');
  },
  audit(rt, p, out) {
    const sub = p.positionals[1];
    if (sub === 'verify' || !sub) { const v = rt.ledger.verify(); out.emit(v); return v.ok ? 0 : 7; }
    if (sub === 'list') { out.emit(rt.ledger.list({ tenantId: rt.ctx.tenantId, ...(str(p.flags, 'object-type') ? { objectType: str(p.flags, 'object-type') as string } : {}), ...(str(p.flags, 'object-id') ? { objectId: str(p.flags, 'object-id') as string } : {}), ...(str(p.flags, 'action') ? { action: str(p.flags, 'action') as string } : {}), limit: num(p.flags, 'limit', 50) }).map((e) => ({ seq: e.seq, ts: e.ts, actor: e.actor, action: e.action, object: `${e.objectType}/${e.objectId.slice(0, 12)}`, policy: e.policyId ?? '', model: e.modelId ?? '', hash: e.hash.slice(0, 12) }))); return 0; }
    throw new EvidentiaError('validation', 'usage: audit verify | audit list [--object-type] [--object-id] [--action] [--limit]');
  },
  cost(rt, p, out) {
    out.emit(rt.meter.summary(rt.ctx.tenantId, str(p.flags, 'since')));
    return 0;
  },
  retention(rt, p, out) {
    if (p.positionals[1] !== 'apply') throw new EvidentiaError('validation', 'usage: retention apply');
    out.emit(applyRetention(rt.db, rt.ledger, rt.policy, rt.ctx));
    return 0;
  },
  export(rt, p, out) {
    const outFile = str(p.flags, 'out');
    const data = exportTenant(rt.db, rt.ctx.tenantId);
    if (outFile) { writeFileSync(resolve(outFile), JSON.stringify(data, null, 2)); out.emit({ written: outFile, tables: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])) }); }
    else out.emit(data);
    rt.ledger.append({ tenantId: rt.ctx.tenantId, actor: rt.ctx.actor, action: 'tenant.export', objectType: 'tenant', objectId: rt.ctx.tenantId, evidence: { tables: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])) } });
    return 0;
  },
  erase(rt, p, out) {
    const reason = str(p.flags, 'reason');
    if (p.positionals[1] !== 'tenant' || !reason || !bool(p.flags, 'confirm')) throw new EvidentiaError('validation', 'usage: erase tenant --reason <text> --confirm');
    out.emit(eraseTenant(rt.db, rt.ledger, rt.ctx, reason));
    return 0;
  },
  async evals(rt, p, out) {
    if (p.positionals[1] !== 'run') throw new EvidentiaError('validation', 'usage: evals run [--dataset <file>] [--out <report.json>]');
    const dir = resolve(REPO_ROOT, 'evals/datasets');
    const files = str(p.flags, 'dataset') ? [resolve(str(p.flags, 'dataset') as string)] : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
    const reports: EvalReport[] = [];
    for (const f of files) reports.push(await runDataset(Dataset.parse(JSON.parse(readFileSync(f, 'utf8'))), rt.policy));
    const outFile = str(p.flags, 'out');
    if (outFile) { mkdirSync(dirname(resolve(outFile)), { recursive: true }); writeFileSync(resolve(outFile), JSON.stringify(reports, null, 2)); }
    const failed = reports.reduce((n, r) => n + r.failed, 0);
    out.emit(reports, () => reports.map((r) => `${r.datasetId} v${r.datasetVersion}: ${r.passed}/${r.total} passed` + r.results.filter((x) => !x.pass).map((x) => `\n  ✗ ${x.id}: ${x.details.join('; ')}`).join('')).join('\n'));
    return failed ? 8 : 0;
  },
  async demo(rt, p, out) {
    if (p.positionals[1] !== 'load') throw new EvidentiaError('validation', 'usage: demo load');
    const demoDir = resolve(REPO_ROOT, 'demo');
    const manifest = readJsonFile<{ models: string; aiSystem: string; processing: string; querySet: string; sources: { locator: string; kind: 'url' | 'file'; authorityLevel: 'official' | 'internal' | 'third-party' | 'unverified'; owner?: string; file: string; contentType: 'text/html' | 'text/markdown' | 'text/plain' }[] }>(join(demoDir, 'manifest.json'));
    for (const m of readJsonFile<ModelRecordInput[]>(join(demoDir, manifest.models))) rt.registry.upsert(rt.ctx, m);
    rt.systems.upsert(rt.ctx, readJsonFile<AiSystemRecordInput>(join(demoDir, manifest.aiSystem)));
    if (rt.processing.list(rt.ctx.tenantId).length === 0) rt.processing.create(rt.ctx, readJsonFile<ProcessingRecordInput>(join(demoDir, manifest.processing)));
    // Rebuild the runtime so the newly registered demo provider is routable for embeddings.
    const rt2 = createRuntime(rt.options);
    const ingested = [];
    for (const s of manifest.sources) {
      const src = rt2.store.addSource(rt2.ctx, { kind: s.kind, locator: s.locator, authorityLevel: s.authorityLevel, ...(s.owner ? { owner: s.owner } : {}) });
      const r = await rt2.store.ingest(rt2.ctx, { sourceId: src.id, content: readFileSync(join(demoDir, s.file), 'utf8'), contentType: s.contentType });
      ingested.push({ locator: s.locator, status: r.status, chunks: r.chunks, claims: r.claims, quarantined: r.quarantined });
    }
    const qs = rt2.observatory.saveQuerySet(rt2.ctx, readJsonFile<QuerySetInput>(join(demoDir, manifest.querySet)));
    rt2.db.close();
    out.emit({ ingested, querySetId: qs.id, next: [`evidentia search "how long are support recordings kept"`, `evidentia draft generate --title "How Northwind reconciles payments" --slug reconciliation-explained --query "payment reconciliation controls" --brand "Northwind Bank"`, `evidentia observe run ${qs.id} --models demo/demo-eu --samples 8`, `evidentia observe report ${qs.id}`] });
    return 0;
  },
};

export function usage(): string {
  return [
    `evidentia ${VERSION} — governed generative visibility. Built and maintained by Clixite SRL — Belgium.`,
    '',
    'Usage: evidentia <command> [subcommand] [options]',
    '',
    'Global options: --db <path> --tenant <id> --actor <id> --policy <yaml> --signing-key <file> --json --verbose',
    '',
    'Commands:',
    '  init | status | version',
    '  analyze <url|file> [--robots f] [--brand n] [--out f]        GEO readiness report (readiness-v1)',
    '  source add|list|delete · ingest <sourceId> --file f | --url u  Knowledge sources and documents',
    '  search <query> · claims · entities · quarantine list|release|hold',
    '  dsar find <term> | dsar redact <term> --replacement r --reason t',
    '  model register|list|status · system register|list · processing register|list · policy show|check',
    '  draft create|generate|list|show|verify|gate|approve|reject|preview|publish · approvals',
    '  observe save|list|run|report                                   AI visibility observatory',
    '  audit verify|list · cost · retention apply · export --out f · erase tenant --reason t --confirm',
    '  evals run [--dataset f] [--out f] · demo load',
    '',
    'Exit codes: 0 ok · 1 error · 2 usage · 3 policy denied · 4 approval required · 5 quarantined · 6 blocked/unsupported · 7 ledger broken · 8 evals failed',
  ].join('\n');
}

export async function main(argv: string[], io: { stdout?: (s: string) => void; stderr?: (s: string) => void } = {}): Promise<number> {
  const stdout = io.stdout ?? ((s) => process.stdout.write(s));
  const stderr = io.stderr ?? ((s) => process.stderr.write(s));
  const p = parseArgs(argv);
  const command = p.positionals[0];
  if (!command || command === 'help' || bool(p.flags, 'help')) { stdout(usage() + '\n'); return command ? 0 : 2; }
  const handler = commands[command];
  if (!handler) { stderr(`unknown command: ${command}\n\n${usage()}\n`); return 2; }
  const env = process.env;
  const dbPath = str(p.flags, 'db') ?? env['EVIDENTIA_DB'] ?? resolve('.evidentia/evidentia.db');
  const options = {
    dbPath,
    tenantId: str(p.flags, 'tenant') ?? env['EVIDENTIA_TENANT'] ?? 'default',
    actor: str(p.flags, 'actor') ?? env['EVIDENTIA_ACTOR'] ?? env['USERNAME'] ?? env['USER'] ?? 'cli',
    policyPath: str(p.flags, 'policy') ?? env['EVIDENTIA_POLICY'] ?? DEFAULT_POLICY,
    signingKeyPath: str(p.flags, 'signing-key') ?? env['EVIDENTIA_SIGNING_KEY'] ?? (dbPath === ':memory:' ? undefined : join(dirname(resolve(dbPath)), 'signing-key.json')),
    verbose: bool(p.flags, 'verbose'),
  };
  if (command === 'version') { stdout(JSON.stringify({ evidentia: VERSION, node: process.versions.node }) + '\n'); return 0; }
  if (command !== 'init' && dbPath !== ':memory:' && !existsSync(dbPath)) { stderr(`no store at ${dbPath}; run "evidentia init" first (or pass --db)\n`); return 2; }
  const rt = createRuntime(options);
  const out = new Output(bool(p.flags, 'json'), stdout);
  try {
    return await handler(rt, p, out);
  } catch (error) {
    if (isEvidentiaError(error)) {
      stderr(`${error.code}: ${error.message}${Object.keys(error.details).length ? '\n' + JSON.stringify(error.details, null, 2) : ''}\n`);
      return error.code === 'validation' ? 2 : error.code === 'policy_denied' ? 3 : error.code === 'approval_required' ? 4 : 1;
    }
    stderr(`error: ${(error as Error).message}\n`);
    if (options.verbose) stderr(`${(error as Error).stack ?? ''}\n`);
    return 1;
  } finally {
    rt.db.close();
  }
}
