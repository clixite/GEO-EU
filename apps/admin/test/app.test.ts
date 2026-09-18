import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRuntime, DEFAULT_POLICY } from '@evidentia/cli/runtime';
import { createApp } from '../src/app.ts';
import { hashToken } from '../src/auth.ts';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const users = [
  { name: 'viewer@acme.example', role: 'viewer' as const, tokenHash: hashToken('viewer-token') },
  { name: 'writer@acme.example', role: 'editor' as const, tokenHash: hashToken('writer-token') },
  { name: 'editor@acme.example', role: 'approver' as const, tokenHash: hashToken('approver-token') },
  { name: 'admin@acme.example', role: 'admin' as const, tokenHash: hashToken('admin-token') },
];

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'evidentia-admin-'));
  const runtime = createRuntime({ dbPath: ':memory:', tenantId: 'acme', actor: 'console', policyPath: DEFAULT_POLICY });
  runtime.registry.upsert(runtime.ctx, { provider: 'local', model: 'hash-384', displayName: 'local', adapter: 'local', hosting: 'self-hosted', dataPolicy: { retentionDays: 0, usedForTraining: false, dpaAvailable: true, zeroDataRetention: true }, allowedDataClasses: ['public', 'internal', 'confidential', 'personal', 'special-category'], approvalStatus: 'approved' });
  const app = createApp({ runtime, users, sessionSecret: SECRET, publishDir: join(dir, 'out') });
  return { app, runtime, dir };
}

async function login(app: ReturnType<typeof createApp>, token: string): Promise<{ cookie: string; csrf: string }> {
  const res = await app.request('/login', { method: 'POST', body: new URLSearchParams({ token }), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(res.status, 302);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
  const home = await app.request('/', { headers: { cookie } });
  const html = await home.text();
  const csrf = html.match(/name="csrf" value="([a-f0-9]+)"/)?.[1] as string;
  return { cookie, csrf };
}

const formPost = (app: ReturnType<typeof createApp>, path: string, cookie: string, fields: Record<string, string>) =>
  app.request(path, { method: 'POST', body: new URLSearchParams(fields), headers: { 'content-type': 'application/x-www-form-urlencoded', cookie } });

test('unauthenticated requests are redirected to login; wrong tokens are rejected and audited; security headers are set', async () => {
  const { app, runtime } = setup();
  const res = await app.request('/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const bad = await app.request('/login', { method: 'POST', body: new URLSearchParams({ token: 'nope' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(bad.status, 401);
  assert.equal(runtime.ledger.list({ action: 'auth.login_failed' }).length, 1);
  const health = await app.request('/healthz');
  assert.equal((await health.json() as { ok: boolean }).ok, true);
});

test('login rate limiting blocks brute force', async () => {
  const { app } = setup();
  let last = 0;
  for (let i = 0; i < 7; i++) {
    const r = await app.request('/login', { method: 'POST', body: new URLSearchParams({ token: 'x' }), headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.9' } });
    last = r.status;
  }
  assert.equal(last, 429);
});

test('session cookie is signed; tampering or forging is rejected', async () => {
  const { app } = setup();
  const { cookie } = await login(app, 'viewer-token');
  const forged = cookie.replace(/ev_session=([^.]+)\./, (_m, p: string) => `ev_session=${Buffer.from(Buffer.from(p, 'base64url').toString().replace('"viewer"', '"admin"')).toString('base64url')}.`);
  const res = await app.request('/', { headers: { cookie: forged } });
  assert.equal(res.status, 302, 'forged cookie treated as unauthenticated');
});

test('CSRF and RBAC are enforced on mutations; the approval flow works end to end through the console', async () => {
  const { app, runtime } = setup();
  const viewer = await login(app, 'viewer-token');
  const writer = await login(app, 'writer-token');
  const approver = await login(app, 'approver-token');

  const noCsrf = await formPost(app, '/knowledge/ingest', writer.cookie, { locator: 'x', content: 'y' });
  assert.equal(noCsrf.status, 403);
  const viewerForbidden = await formPost(app, '/knowledge/ingest', viewer.cookie, { csrf: viewer.csrf, locator: 'x', content: 'y' });
  assert.equal(viewerForbidden.status, 403);

  const ingest = await formPost(app, '/knowledge/ingest', writer.cookie, { csrf: writer.csrf, locator: 'https://www.northwind.example/reconciliation', authority: 'official', content: 'Northwind Bank SA reconciles 2.3 million payments per day across 14 countries.' });
  assert.equal(ingest.status, 302);
  assert.equal(runtime.store.stats('acme').documents, 1);

  const create = await formPost(app, '/drafts', writer.cookie, { csrf: writer.csrf, title: 'Reconciliation', slug: 'reconciliation', query: 'payments per day', body: 'Northwind Bank reconciles 2.3 million payments per day across 14 countries [E1].', topics: 'finance' });
  assert.equal(create.status, 302);
  const draftId = (create.headers.get('location') ?? '').match(/\/drafts\/([^?]+)/)?.[1] as string;
  assert.ok(draftId);

  assert.equal((await formPost(app, `/drafts/${draftId}/verify`, writer.cookie, { csrf: writer.csrf })).status, 302);
  assert.equal((await formPost(app, `/drafts/${draftId}/gate`, writer.cookie, { csrf: writer.csrf })).status, 302);
  assert.equal(runtime.pipeline.get('acme', draftId).status, 'awaiting_approval', 'finance topic requires approval');

  const writerApprove = await formPost(app, `/drafts/${draftId}/decide`, writer.cookie, { csrf: writer.csrf, decision: 'approved' });
  assert.equal(writerApprove.status, 403, 'editor role cannot approve');
  const approve = await formPost(app, `/drafts/${draftId}/decide`, approver.cookie, { csrf: approver.csrf, decision: 'approved', note: 'ok' });
  assert.equal(approve.status, 302);
  assert.equal(runtime.pipeline.get('acme', draftId).status, 'approved');

  const publish = await formPost(app, `/drafts/${draftId}/publish`, approver.cookie, { csrf: approver.csrf, editor: 'Anna Peeters', role: 'Head of Communications' });
  assert.equal(publish.status, 302);
  assert.equal(runtime.pipeline.get('acme', draftId).status, 'published');

  const detail = await (await app.request(`/drafts/${draftId}`, { headers: { cookie: viewer.cookie } })).text();
  assert.match(detail, /published/);
  assert.match(detail, /draft\.publish/);
  const audit = await (await app.request('/audit', { headers: { cookie: viewer.cookie } })).text();
  assert.match(audit, /Ledger intact/);
  for (const path of ['/', '/knowledge', '/readiness', '/drafts', '/approvals', '/observatory', '/governance', '/governance/models', '/governance/systems', '/governance/policy', '/audit', '/security', '/settings']) {
    const r = await app.request(path, { headers: { cookie: viewer.cookie } });
    assert.equal(r.status, 200, path);
    const html = await r.text();
    assert.match(html, /<main id="main">/, `${path} has main landmark`);
    assert.match(html, /Clixite SRL — Belgium/, `${path} carries the Clixite mark`);
  }
});

test('readiness form analyses pasted HTML and records the analysis', async () => {
  const { app, runtime } = setup();
  const writer = await login(app, 'writer-token');
  const res = await formPost(app, '/readiness', writer.cookie, { csrf: writer.csrf, url: 'https://www.northwind.example/x', html: '<html lang="en"><head><title>T</title></head><body><main><h1>T</h1><p>Short.</p></main></body></html>', robots: 'User-agent: *\nAllow: /' });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Recommendations/);
  assert.match(html, /OAI-SearchBot/);
  assert.equal(runtime.ledger.list({ action: 'readiness.analyze' }).length, 1);
});
