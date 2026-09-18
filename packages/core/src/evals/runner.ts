import { z } from 'zod';
import { analyzePage } from '../geo/analyzer.ts';
import { evaluateAiAccess } from '../geo/robots.ts';
import { evaluateModelAccess, evaluatePublication, type PolicyDocument } from '../governance/policy.ts';
import { ModelRecord } from '../governance/schemas.ts';
import { verifyDraft, type EvidenceItem } from '../content/grounding.ts';
import { scanForInjection } from '../security/injection.ts';
import { openDatabase } from '../storage/database.ts';
import { AuditLedger } from '../audit/ledger.ts';
import { KnowledgeStore } from '../knowledge/store.ts';
import { HybridRetriever } from '../retrieval/hybrid.ts';
import { localEmbed } from '../providers/localEmbedding.ts';
import { fixedClock } from '../shared/clock.ts';

/**
 * Deterministic evaluation runner.
 *
 * Datasets are versioned JSON files with typed cases. Every evaluator here is
 * deterministic (no model calls), so results are reproducible in CI and can act
 * as regression gates. Model-judged evaluations (content quality) are a separate,
 * clearly-labelled path and never the sole gate.
 */

const Case = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('readiness'), id: z.string(), input: z.object({ url: z.string(), html: z.string(), robotsTxt: z.string().nullable().optional(), now: z.string().optional() }), expect: z.object({ checks: z.record(z.string(), z.enum(['pass', 'warn', 'fail', 'info', 'na'])).default({}), scoreMin: z.number().optional(), scoreMax: z.number().optional(), blockedSearchEngines: z.array(z.string()).optional() }) }),
  z.object({ kind: z.literal('policy-model-access'), id: z.string(), input: z.object({ model: ModelRecord, dataClasses: z.array(z.enum(['public', 'internal', 'confidential', 'personal', 'special-category'])) }), expect: z.object({ effect: z.enum(['allow', 'deny']), matchedRule: z.string().optional() }) }),
  z.object({ kind: z.literal('policy-publication'), id: z.string(), input: z.object({ aiAssisted: z.boolean(), readinessScore: z.number(), evidenceCoverage: z.number(), unsupportedClaims: z.number(), topics: z.array(z.string()).default([]), sourceKinds: z.array(z.string()).default([]) }), expect: z.object({ effect: z.enum(['allow', 'deny', 'require_approval']), requiresDisclosure: z.boolean().optional() }) }),
  z.object({ kind: z.literal('grounding'), id: z.string(), input: z.object({ draft: z.string(), evidence: z.array(z.object({ id: z.string(), text: z.string(), locator: z.string() })) }), expect: z.object({ unsupportedClaims: z.number(), coverageMin: z.number().optional(), placeholders: z.number().optional() }) }),
  z.object({ kind: z.literal('injection'), id: z.string(), input: z.object({ text: z.string() }), expect: z.object({ high: z.boolean(), ids: z.array(z.string()).optional() }) }),
  z.object({ kind: z.literal('robots'), id: z.string(), input: z.object({ robotsTxt: z.string(), path: z.string() }), expect: z.object({ agents: z.record(z.string(), z.boolean()) }) }),
  z.object({ kind: z.literal('retrieval'), id: z.string(), input: z.object({ corpus: z.array(z.object({ locator: z.string(), authorityLevel: z.enum(['official', 'internal', 'third-party', 'unverified']).default('internal'), text: z.string() })), query: z.string(), semantic: z.boolean().default(true) }), expect: z.object({ topLocator: z.string(), withinTop: z.number().default(1) }) }),
  z.object({ kind: z.literal('isolation'), id: z.string(), input: z.object({ tenantA: z.string(), tenantB: z.string(), text: z.string(), query: z.string() }), expect: z.object({ crossTenantHits: z.literal(0) }) }),
]);
export type EvalCase = z.infer<typeof Case>;

export const Dataset = z.object({ id: z.string(), version: z.string(), description: z.string(), cases: z.array(Case).min(1) });
export type Dataset = z.infer<typeof Dataset>;

export interface CaseResult {
  id: string;
  kind: EvalCase['kind'];
  pass: boolean;
  details: string[];
}

export interface EvalReport {
  datasetId: string;
  datasetVersion: string;
  ranAt: string;
  total: number;
  passed: number;
  failed: number;
  results: CaseResult[];
}

export async function runDataset(dataset: Dataset, policy: PolicyDocument, now = new Date()): Promise<EvalReport> {
  const results: CaseResult[] = [];
  for (const c of dataset.cases) results.push(await runCase(c, policy, now));
  const passed = results.filter((r) => r.pass).length;
  return { datasetId: dataset.id, datasetVersion: dataset.version, ranAt: now.toISOString(), total: results.length, passed, failed: results.length - passed, results };
}

export async function runCase(c: EvalCase, policy: PolicyDocument, now: Date): Promise<CaseResult> {
  const details: string[] = [];
  const expect = (cond: boolean, msg: string) => { if (!cond) details.push(msg); };
  switch (c.kind) {
    case 'readiness': {
      const r = analyzePage({ url: c.input.url, html: c.input.html, ...(c.input.robotsTxt !== undefined ? { robotsTxt: c.input.robotsTxt } : {}), now: c.input.now ? new Date(c.input.now) : now });
      for (const [id, status] of Object.entries(c.expect.checks)) {
        const actual = r.checks.find((x) => x.id === id)?.status;
        expect(actual === status, `${id}: expected ${status}, got ${actual ?? 'missing'} (${r.checks.find((x) => x.id === id)?.evidence ?? ''})`);
      }
      if (c.expect.scoreMin !== undefined) expect(r.score >= c.expect.scoreMin, `score ${r.score} < ${c.expect.scoreMin}`);
      if (c.expect.scoreMax !== undefined) expect(r.score <= c.expect.scoreMax, `score ${r.score} > ${c.expect.scoreMax}`);
      if (c.expect.blockedSearchEngines) expect(JSON.stringify(r.blockedSearchEngines) === JSON.stringify(c.expect.blockedSearchEngines), `blocked ${JSON.stringify(r.blockedSearchEngines)}`);
      break;
    }
    case 'policy-model-access': {
      const d = evaluateModelAccess(policy, c.input.model, c.input.dataClasses);
      expect(d.effect === c.expect.effect, `effect ${d.effect} ≠ ${c.expect.effect}: ${d.reasons.join('; ')}`);
      if (c.expect.matchedRule) expect(d.matchedRules.includes(c.expect.matchedRule), `matched ${d.matchedRules.join(',')}`);
      break;
    }
    case 'policy-publication': {
      const d = evaluatePublication(policy, c.input);
      expect(d.effect === c.expect.effect, `effect ${d.effect} ≠ ${c.expect.effect}: ${d.reasons.join('; ')}`);
      if (c.expect.requiresDisclosure !== undefined) expect(d.requiresDisclosure === c.expect.requiresDisclosure, `disclosure ${d.requiresDisclosure}`);
      break;
    }
    case 'grounding': {
      const ev: EvidenceItem[] = c.input.evidence.map((e) => ({ ...e, title: null, headingPath: '', authorityLevel: 'internal', modifiedAt: null }));
      const v = verifyDraft(c.input.draft, ev);
      expect(v.unsupportedClaims === c.expect.unsupportedClaims, `unsupported ${v.unsupportedClaims} ≠ ${c.expect.unsupportedClaims}: ${v.claims.filter((x) => !x.supported).map((x) => `"${x.text}" (${x.reason})`).join(' | ')}`);
      if (c.expect.coverageMin !== undefined) expect(v.evidenceCoverage >= c.expect.coverageMin, `coverage ${v.evidenceCoverage}`);
      if (c.expect.placeholders !== undefined) expect(v.placeholders.length === c.expect.placeholders, `placeholders ${v.placeholders.length}`);
      break;
    }
    case 'injection': {
      const f = scanForInjection(c.input.text);
      const high = f.some((x) => x.severity === 'high');
      expect(high === c.expect.high, `high=${high}, findings=${f.map((x) => x.id).join(',')}`);
      for (const id of c.expect.ids ?? []) expect(f.some((x) => x.id === id), `missing finding ${id}`);
      break;
    }
    case 'robots': {
      const access = evaluateAiAccess(c.input.robotsTxt, c.input.path);
      for (const [token, allowed] of Object.entries(c.expect.agents)) {
        const a = access.find((x) => x.token.toLowerCase() === token.toLowerCase());
        expect(a?.allowed === allowed, `${token}: expected ${allowed}, got ${a?.allowed} (${a?.rule})`);
      }
      break;
    }
    case 'retrieval': {
      const db = openDatabase();
      const ledger = new AuditLedger(db, fixedClock(now));
      const store = new KnowledgeStore(db, ledger, { embedder: async (t) => ({ vectors: t.map(localEmbed), model: 'local' }) });
      const ctx = { tenantId: 'eval', actor: 'eval' };
      for (const doc of c.input.corpus) {
        const s = store.addSource(ctx, { kind: 'manual', locator: doc.locator, authorityLevel: doc.authorityLevel });
        await store.ingest(ctx, { sourceId: s.id, content: doc.text, contentType: 'text/plain' });
      }
      const hits = await new HybridRetriever(db).search('eval', c.input.query, { k: 5, ...(c.input.semantic ? { embedQuery: async (q) => localEmbed(q) } : {}) });
      const idx = hits.findIndex((h) => h.locator === c.expect.topLocator);
      expect(idx !== -1 && idx < c.expect.withinTop, `expected ${c.expect.topLocator} within top ${c.expect.withinTop}; got ${hits.map((h) => h.locator).join(', ')}`);
      db.close();
      break;
    }
    case 'isolation': {
      const db = openDatabase();
      const ledger = new AuditLedger(db, fixedClock(now));
      const store = new KnowledgeStore(db, ledger);
      const a = store.addSource({ tenantId: c.input.tenantA, actor: 'eval' }, { kind: 'manual', locator: 'doc-a' });
      await store.ingest({ tenantId: c.input.tenantA, actor: 'eval' }, { sourceId: a.id, content: c.input.text, contentType: 'text/plain' });
      const hits = await new HybridRetriever(db).search(c.input.tenantB, c.input.query, { k: 5 });
      expect(hits.length === 0, `tenant ${c.input.tenantB} saw ${hits.length} hit(s) from ${c.input.tenantA}`);
      expect(store.listDocuments(c.input.tenantB).length === 0, 'document listing leaked across tenants');
      expect(store.findTerm(c.input.tenantB, c.input.query).chunks.length === 0, 'findTerm leaked across tenants');
      db.close();
      break;
    }
  }
  return { id: c.id, kind: c.kind, pass: details.length === 0, details };
}
