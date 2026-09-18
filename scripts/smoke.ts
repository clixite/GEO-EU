/**
 * End-to-end CLI smoke test of the offline demo flow. Used by CI and by
 * `pnpm smoke`. Exits non-zero on the first unexpected result.
 *
 *   SOURCE → KNOWLEDGE → GEO ANALYSIS → DRAFT → EVIDENCE → GOVERNANCE → APPROVAL → PUBLISH → AI VISIBILITY → REPORT
 */
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../packages/cli/src/main.ts';

const dir = mkdtempSync(join(tmpdir(), 'evidentia-smoke-'));
const db = join(dir, 'smoke.db');
const base = ['--db', db, '--tenant', 'demo', '--json'];
let step = 0;

async function run(args: string[], actor = 'writer@northwind.example', expectCode = 0): Promise<Record<string, unknown>> {
  step += 1;
  let out = '';
  let err = '';
  const code = await main([...args, ...base, '--actor', actor], { stdout: (s) => { out += s; }, stderr: (s) => { err += s; } });
  if (code !== expectCode) {
    process.stderr.write(`step ${step} "${args.join(' ')}" exited ${code} (expected ${expectCode})\n${err}${out.slice(0, 2000)}\n`);
    process.exit(1);
  }
  process.stdout.write(`ok ${step}: ${args.slice(0, 3).join(' ')}\n`);
  try { return JSON.parse(out) as Record<string, unknown>; } catch { return { raw: out }; }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    process.stderr.write(`assertion failed at step ${step}: ${msg}\n`);
    process.exit(1);
  }
}

const init = await run(['init']);
assert((init['ledger'] as { ok: boolean }).ok, 'ledger ok after init');
const loaded = await run(['demo', 'load']);
const ingested = loaded['ingested'] as { locator: string; quarantined: boolean; claims: number }[];
assert(ingested.length === 6, 'six demo sources ingested');
assert(ingested.find((i) => i.locator.includes('partner-blog'))?.quarantined === true, 'poisoned blog quarantined');
assert(ingested.filter((i) => !i.quarantined).every((i) => i.claims >= 1), 'claims extracted from clean sources');
const querySetId = loaded['querySetId'] as string;

const status = await run(['status']);
assert((status['knowledge'] as { documents: number }).documents === 6, 'six documents in store');
assert((status['quarantined'] as number) === 1, 'one quarantined document');

const hits = (await run(['search', 'how long are support recordings kept'])) as unknown as { locator: string; text: string }[];
assert(Array.isArray(hits) && /retention|faq/.test(hits[0]?.locator ?? '') && hits.some((h) => h.text.includes('90 days')), `top hit is an official page stating the 90-day rule (got ${hits[0]?.locator})`);
assert(!hits.some((h) => h.text.includes('50 million')), 'poisoned content never reaches retrieval');

const analysis = await run(['analyze', 'demo/sources/reconciliation-service.html', '--url', 'https://www.northwind.example/reconciliation', '--robots', 'demo/robots.txt', '--brand', 'Northwind Bank']);
assert((analysis['score'] as number) >= 85, `demo page readiness ≥ 85 (got ${analysis['score']})`);

const draft = await run(['draft', 'generate', '--title', 'How Northwind reconciles corporate payments', '--slug', 'reconciliation-explained', '--query', 'payment reconciliation controls and escalation', '--brand', 'Northwind Bank']);
const draftId = draft['id'] as string;
const verification = draft['verification'] as { unsupportedClaims: number; materialClaims: number };
assert(verification.unsupportedClaims === 0 && verification.materialClaims >= 2, `grounded draft verifies (${JSON.stringify(verification)})`);
assert(draft['model'] === 'demo/demo-eu', 'routed to the demo model');

const gated = await run(['draft', 'gate', draftId]);
assert(gated['status'] === 'awaiting_approval', 'AI-assisted draft needs human approval');
await run(['draft', 'approve', draftId], 'writer@northwind.example', 3); // four-eyes: same actor is refused
const approved = await run(['draft', 'approve', draftId, '--note', 'checked against the 2025 results'], 'editor@northwind.example');
assert(approved['status'] === 'approved', 'approved by a second person');

const outDir = join(dir, 'site');
const published = await run(['draft', 'publish', draftId, '--target', `static:${outDir}`, '--editor', 'Anna Peeters', '--role', 'Head of Communications'], 'editor@northwind.example');
assert(published['status'] === 'published', 'published');
const html = readFileSync(join(outDir, 'reconciliation-explained.html'), 'utf8');
assert(html.includes('AI transparency notice') && html.includes('ai-disclosure'), 'disclosure present in published HTML');
assert(!html.includes('[E1]'), 'evidence markers stripped');
assert(existsSync(join(outDir, 'reconciliation-explained.manifest.json')), 'signed manifest written');

await run(['draft', 'publish', draftId, '--target', `static:${outDir}`, '--editor', 'Anna Peeters', '--role', 'Head of Communications'], 'editor@northwind.example', 4); // cannot publish twice

const runSummary = await run(['observe', 'run', querySetId, '--models', 'demo/demo-eu', '--samples', '4']);
assert((runSummary['observations'] as number) === 7 * 4, `observations = queries+paraphrases × samples (got ${runSummary['observations']})`);
const report = await run(['observe', 'report', querySetId]);
const overall = report['overall'] as { mention: { n: number; low: number; high: number } };
assert(overall.mention.n === 28 && overall.mention.high > overall.mention.low, 'report carries Wilson intervals');

await run(['observe', 'run', querySetId, '--models', 'mistral/mistral-large-latest', '--samples', '1'], 'writer@northwind.example', 3); // unapproved model denied by policy

const dsar = await run(['dsar', 'find', 'Anna Peeters']);
assert((dsar['chunks'] as unknown[]).length >= 1, 'DSAR lookup finds the spokesperson');

const audit = await run(['audit', 'verify']);
assert((audit['ok'] as boolean) === true, 'audit ledger intact');
const evals = await run(['evals', 'run']);
assert(Array.isArray(evals) && (evals as { failed: number }[]).every((r) => r.failed === 0), 'all eval datasets pass');
const exported = await run(['export', '--out', join(dir, 'export.json')]);
assert((exported['tables'] as Record<string, number>)['documents'] === 6, 'tenant export contains documents');

rmSync(dir, { recursive: true, force: true });
process.stdout.write(`smoke test passed (${step} steps)\n`);
