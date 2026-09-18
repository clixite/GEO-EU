import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Runtime } from '@evidentia/cli/runtime';
import { analyzePage, recommendations, StaticExportAdapter, evaluateModelAccess, newId, type DataClass, type ModelRecordInput } from '@evidentia/core';
import { authenticate, hasRole, LoginRateLimiter, SessionSigner, type Role, type Session, type UserRecord } from './auth.ts';
import { CSS, badge, e, form, kpi, layout, loginPage, pct, table } from './views.ts';

/**
 * Governance console (server-rendered). Every mutating route requires a role, a
 * valid session and a CSRF token, and is executed through the core services so
 * it is audited exactly like the CLI.
 */

export interface AppOptions {
  runtime: Runtime;
  users: UserRecord[];
  sessionSecret: string;
  publishDir?: string;
  now?: () => number;
}

type Vars = { session: Session | null; requestId: string };

const MAX_BODY = 512 * 1024;

export function createApp(options: AppOptions): Hono<{ Variables: Vars }> {
  const { runtime: rt } = options;
  const signer = new SessionSigner(options.sessionSecret);
  const limiter = new LoginRateLimiter();
  const app = new Hono<{ Variables: Vars }>();
  const tenant = rt.ctx.tenantId;

  app.use('*', async (c, next) => {
    c.set('requestId', c.req.header('x-request-id') ?? newId());
    c.set('session', signer.verify(getCookie(c, 'ev_session'), options.now?.() ?? Date.now()));
    await next();
    c.header('content-security-policy', "default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    c.header('x-content-type-options', 'nosniff');
    c.header('x-frame-options', 'DENY');
    c.header('referrer-policy', 'no-referrer');
    c.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    c.header('cache-control', 'no-store');
    c.header('x-request-id', c.get('requestId'));
    if (c.req.url.startsWith('https://')) c.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
  });

  app.get('/assets/app.css', (c) => c.body(CSS, 200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600' }));
  app.get('/healthz', (c) => c.json({ ok: true, ledger: rt.ledger.verify().ok }));

  app.get('/login', (c) => (c.get('session') ? c.redirect('/') : c.html(loginPage())));
  app.post('/login', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    if (!limiter.allow(ip, options.now?.() ?? Date.now())) return c.html(loginPage('Too many attempts. Try again later.'), 429);
    const body = await c.req.parseBody();
    const token = typeof body['token'] === 'string' ? body['token'] : '';
    const user = authenticate(options.users, token);
    if (!user) {
      rt.ledger.append({ tenantId: tenant, actor: 'anonymous', action: 'auth.login_failed', objectType: 'console', objectId: 'login', evidence: { ip } });
      return c.html(loginPage('Invalid token.'), 401);
    }
    limiter.reset(ip);
    const { cookie } = signer.create(user, options.now?.() ?? Date.now());
    setCookie(c, 'ev_session', cookie, { httpOnly: true, sameSite: 'Strict', secure: c.req.url.startsWith('https://'), path: '/', maxAge: Math.floor(signer.ttlMs / 1000) });
    rt.ledger.append({ tenantId: tenant, actor: user.name, action: 'auth.login', objectType: 'console', objectId: 'login', evidence: { role: user.role } });
    return c.redirect('/');
  });

  // Everything below requires a session.
  app.use('*', async (c, next) => {
    if (!c.get('session')) return c.redirect('/login');
    await next();
  });

  const requireRole = (c: { get(k: 'session'): Session | null }, role: Role): Session => {
    const s = c.get('session') as Session;
    if (!hasRole(s.role, role)) throw new ForbiddenError(`requires role ${role}`);
    return s;
  };
  const checkCsrf = async (c: { get(k: 'session'): Session | null; req: { parseBody(): Promise<Record<string, string | File | (string | File)[]>>; header(n: string): string | undefined } }): Promise<Record<string, string>> => {
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > MAX_BODY) throw new ForbiddenError('request body too large');
    const body = await c.req.parseBody();
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) if (typeof v === 'string') flat[k] = v;
    if (flat['csrf'] !== (c.get('session') as Session).csrf) throw new ForbiddenError('invalid CSRF token');
    return flat;
  };
  const ctxFor = (s: Session, requestId: string) => ({ tenantId: tenant, actor: s.user, requestId });
  const page = (c: { get(k: 'session'): Session | null; req: { path: string; query(k: string): string | undefined } }, title: string, body: string, subtitle?: string) => {
    const s = c.get('session') as Session;
    const flashKind = c.req.query('ok') ? 'ok' : c.req.query('err') ? 'bad' : null;
    return layout({ title, ...(subtitle ? { subtitle } : {}), path: c.req.path, user: { name: s.user, role: s.role }, tenant, csrf: s.csrf, body, flash: flashKind ? { kind: flashKind, text: (c.req.query('ok') ?? c.req.query('err')) as string } : null });
  };

  app.post('/logout', async (c) => {
    await checkCsrf(c);
    deleteCookie(c, 'ev_session', { path: '/' });
    return c.redirect('/login');
  });

  app.get('/', (c) => {
    const stats = rt.store.stats(tenant);
    const drafts = rt.pipeline.list(tenant);
    const pending = rt.approvals.listPending(tenant);
    const overdue = rt.systems.overdueReviews(tenant);
    const cost = rt.meter.summary(tenant, new Date(Date.now() - 30 * 86_400_000).toISOString());
    const ledger = rt.ledger.verify();
    const body = `
<div class="grid c3">
${kpi('Knowledge', stats.documents, `${stats.claims} claims · ${stats.entities} entities`)}
${kpi('Quarantined', rt.store.quarantined(tenant).length, 'documents awaiting review')}
${kpi('Pending approvals', pending.length, 'human decisions required')}
${kpi('Published', drafts.filter((d) => d.status === 'published').length, `${drafts.length} drafts in pipeline`)}
${kpi('Model spend (30 d)', `€${cost.costEur.toFixed(2)}`, `${cost.calls} calls · ${cost.errors} errors`)}
${kpi('Audit ledger', ledger.ok ? 'intact' : 'BROKEN', ledger.ok ? `${ledger.count} events` : `at seq ${(ledger as { brokenAt: number }).brokenAt}`)}
</div>
<div class="grid c2" style="margin-top:16px">
<div class="card"><h2>Needs attention</h2>${table(['Item', 'Detail'], [
  ...pending.map((a) => [`<a href="/approvals">Approval · ${e(a.action)}</a>`, `requested by ${e(a.requestedBy)} — ${e(a.reason ?? '')}`]),
  ...overdue.map((s) => [`<a href="/governance/systems">Review overdue · ${e(s.record.name)}</a>`, `due ${e(s.record.reviewDate)}`]),
  ...rt.store.quarantined(tenant).map((d) => [`<a href="/knowledge">Quarantined · ${e(d.title ?? d.id)}</a>`, e(((d.metadata?.['quarantineReason'] as string[] | undefined) ?? []).join(', '))]),
  ...rt.registry.list(tenant).filter((m) => m.record.approvalStatus === 'draft').map((m) => [`<a href="/governance/models">Model awaiting approval · ${e(m.record.provider)}/${e(m.record.model)}</a>`, e(m.record.hosting)]),
], 'Nothing needs attention.')}</div>
<div class="card"><h2>Recent audit events</h2>${table(['When', 'Actor', 'Action', 'Object'], rt.ledger.list({ tenantId: tenant, limit: 5000 }).slice(-8).reverse().map((ev) => [e(ev.ts.slice(0, 19).replace('T', ' ')), e(ev.actor), `<span class="mono">${e(ev.action)}</span>`, `<span class="mono">${e(ev.objectType)}/${e(ev.objectId.slice(0, 8))}</span>`]))}</div>
</div>`;
    return c.html(page(c, 'Executive overview', body, `Policy ${rt.policy.id} v${rt.policy.version} · tenant ${tenant}`));
  });

  app.get('/knowledge', (c) => {
    const s = c.get('session') as Session;
    const sources = rt.store.listSources(tenant);
    const stale = rt.store.staleDocuments(tenant, 365);
    const quarantined = rt.store.quarantined(tenant);
    const body = `
<div class="grid c3">${kpi('Sources', sources.length)}${kpi('Stale > 1 year', stale.length, 'freshness worklist')}${kpi('Embedded chunks', `${rt.store.stats(tenant).embeddedChunks}/${rt.store.stats(tenant).chunks}`)}</div>
<div class="card" style="margin-top:16px"><h2>Sources</h2>${table(['Locator', 'Kind', 'Authority', 'Owner', 'Documents'], sources.map((src) => [e(src.locator), e(src.kind), badge(src.authorityLevel), e(src.owner ?? '—'), String(rt.store.listDocuments(tenant, src.id).length)]))}</div>
<div class="card" style="margin-top:16px"><h2>Quarantined documents (suspected prompt injection)</h2>${table(['Title', 'Findings', 'Action'], quarantined.map((d) => [e(d.title ?? d.id), e(((d.metadata?.['quarantineReason'] as string[] | undefined) ?? []).join(', ')), hasRole(s.role, 'editor') ? form(`/knowledge/${d.id}/release`, s.csrf, `<label for="n${d.id}">Reviewer note</label><input id="n${d.id}" type="text" name="note" required>`, 'Release after review', 'inline') : '<span class="muted">editor role required</span>']), 'No quarantined documents.')}</div>
<div class="card" style="margin-top:16px"><h2>Add a source and ingest text</h2>${hasRole(s.role, 'editor') ? form('/knowledge/ingest', s.csrf, `<label for="locator">Locator (URL or path)</label><input id="locator" name="locator" type="text" required><label for="authority">Authority level</label><select id="authority" name="authority"><option value="official">official</option><option value="internal" selected>internal</option><option value="third-party">third-party</option><option value="unverified">unverified</option></select><label for="content">Content (HTML, Markdown or text)</label><textarea id="content" name="content" required></textarea>`, 'Ingest') : '<p class="muted">Editor role required.</p>'}</div>`;
    return c.html(page(c, 'Knowledge health', body, 'Sources, provenance, freshness and quarantine'));
  });
  app.post('/knowledge/ingest', async (c) => {
    const s = requireRole(c, 'editor');
    const b = await checkCsrf(c);
    const src = rt.store.addSource(ctxFor(s, c.get('requestId')), { kind: /^https?:\/\//.test(b['locator'] ?? '') ? 'url' : 'manual', locator: b['locator'] ?? '', authorityLevel: (b['authority'] ?? 'internal') as 'internal' });
    const r = await rt.store.ingest(ctxFor(s, c.get('requestId')), { sourceId: src.id, content: b['content'] ?? '' });
    return c.redirect(`/knowledge?${r.quarantined ? 'err=Ingested+but+quarantined:+' + encodeURIComponent((r.quarantineReason ?? []).join(', ')) : 'ok=Ingested+' + r.chunks + '+chunks,+' + r.claims + '+claims'}`);
  });
  app.post('/knowledge/:id/release', async (c) => {
    const s = requireRole(c, 'editor');
    const b = await checkCsrf(c);
    rt.store.setQuarantine(ctxFor(s, c.get('requestId')), c.req.param('id'), false, b['note'] ?? '');
    return c.redirect('/knowledge?ok=Document+released');
  });

  app.get('/readiness', (c) => {
    const s = c.get('session') as Session;
    const body = `<div class="card"><h2>Analyse a page</h2><p class="muted">Paste the HTML of a page (and optionally its robots.txt). Nothing is fetched from the network by this form; use the CLI for live URLs.</p>${form('/readiness', s.csrf, `<label for="url">Page URL (for canonical and robots evaluation)</label><input id="url" name="url" type="url" required value="https://"><label for="html">HTML</label><textarea id="html" name="html" required></textarea><label for="robots">robots.txt (optional)</label><textarea id="robots" name="robots" style="min-height:80px"></textarea><label for="brand">Brand name (optional)</label><input id="brand" name="brand" type="text">`, 'Analyse')}</div>`;
    return c.html(page(c, 'GEO readiness', body, 'readiness-v1 · evidence-tiered checks, per-engine access matrix'));
  });
  app.post('/readiness', async (c) => {
    const s = c.get('session') as Session;
    const b = await checkCsrf(c);
    let report;
    try {
      report = analyzePage({ url: b['url'] ?? '', html: b['html'] ?? '', ...(b['robots'] ? { robotsTxt: b['robots'] } : {}), ...(b['brand'] ? { brand: { name: b['brand'] } } : {}) });
    } catch (err) {
      return c.redirect(`/readiness?err=${encodeURIComponent((err as Error).message)}`);
    }
    rt.ledger.append({ tenantId: tenant, actor: s.user, action: 'readiness.analyze', objectType: 'url', objectId: report.url, requestId: c.get('requestId'), evidence: { score: report.score, deterministicScore: report.deterministicScore, penalties: report.penalties } });
    const body = `
<div class="grid c3">${kpi('Score', report.score, '/100')}${kpi('Deterministic', report.deterministicScore, `penalties −${report.penalties}`)}${kpi('Blocked engines', report.blockedSearchEngines.length, report.blockedSearchEngines.join(', ') || 'none')}</div>
<div class="card" style="margin-top:16px"><h2>Dimensions</h2>${report.dimensions.map((d) => `<div style="margin:8px 0"><div style="display:flex;justify-content:space-between"><span>${e(d.dimension)}</span><span>${d.points.toFixed(1)} / ${d.maxPoints}</span></div><div class="bar"><span style="width:${d.maxPoints ? Math.round((d.points / d.maxPoints) * 100) : 0}%"></span></div></div>`).join('')}</div>
<div class="card" style="margin-top:16px"><h2>Recommendations</h2>${table(['Points at stake', 'Check', 'Recommendation'], recommendations(report).map((r) => [String(r.atStake), e(r.title), e(r.recommendation)]), 'No recommendations — nothing to fix.')}</div>
<div class="card" style="margin-top:16px"><h2>All checks</h2>${table(['Status', 'ID', 'Tier', 'Check', 'Evidence'], report.checks.map((ch) => [badge(ch.status), e(ch.id), e(ch.tier), e(ch.title), e(ch.evidence)]))}</div>
<div class="card" style="margin-top:16px"><h2>AI agent access (robots.txt)</h2>${table(['Agent', 'Engine', 'Purpose', 'Allowed', 'Rule'], report.engineAccess.map((a) => [e(a.token), e(a.engine), e(a.purpose), badge(a.allowed ? 'ok' : 'bad'), e(a.rule ?? '—')]))}</div>
<p><a href="/readiness">Analyse another page</a></p>`;
    return c.html(page(c, `Readiness — ${report.page.title ?? report.url}`, body, report.url));
  });

  app.get('/drafts', (c) => {
    const s = c.get('session') as Session;
    const drafts = rt.pipeline.list(tenant);
    const body = `<div class="card"><h2>Pipeline</h2>${table(['Title', 'Status', 'AI', 'Coverage', 'Unsupported', 'Updated'], drafts.map((d) => [`<a href="/drafts/${d.id}">${e(d.title)}</a>`, badge(d.status), d.aiAssisted ? `<span class="mono">${e(d.modelId ?? 'yes')}</span>` : 'no', d.verification ? `${(d.verification.evidenceCoverage * 100).toFixed(0)}%` : '—', d.verification ? String(d.verification.unsupportedClaims) : '—', e(d.updatedAt.slice(0, 16).replace('T', ' '))]))}</div>
<div class="card" style="margin-top:16px"><h2>New draft (human-written, with evidence search)</h2>${hasRole(s.role, 'editor') ? form('/drafts', s.csrf, `<label for="title">Title</label><input id="title" name="title" type="text" required><label for="slug">Slug</label><input id="slug" name="slug" type="text" pattern="[a-z0-9][a-z0-9-]*" required><label for="query">Evidence query (retrieves passages to cite as [E1], [E2]…)</label><input id="query" name="query" type="text"><label for="body">Body (Markdown; cite evidence with [E#])</label><textarea id="body" name="body" required></textarea><label for="topics">Topics (comma separated; health, finance, legal… require approval)</label><input id="topics" name="topics" type="text">`, 'Create draft') : '<p class="muted">Editor role required.</p>'}</div>`;
    return c.html(page(c, 'Content pipeline', body, 'draft → verified → gated → approved → published'));
  });
  app.post('/drafts', async (c) => {
    const s = requireRole(c, 'editor');
    const b = await checkCsrf(c);
    try {
      const hits = b['query'] ? await rt.retriever.search(tenant, b['query'], { k: 6 }) : [];
      const { evidenceFromHits } = await import('@evidentia/core');
      const d = rt.pipeline.createDraft(ctxFor(s, c.get('requestId')), { title: b['title'] ?? '', slug: b['slug'] ?? '', body: b['body'] ?? '', aiAssisted: false, author: s.user, evidence: evidenceFromHits(hits), topics: (b['topics'] ?? '').split(',').map((t) => t.trim()).filter(Boolean) });
      return c.redirect(`/drafts/${d.id}?ok=Draft+created+with+${hits.length}+evidence+passages`);
    } catch (err) {
      return c.redirect(`/drafts?err=${encodeURIComponent((err as Error).message)}`);
    }
  });
  app.get('/drafts/:id', (c) => {
    const s = c.get('session') as Session;
    let d;
    try { d = rt.pipeline.get(tenant, c.req.param('id')); } catch { return c.notFound(); }
    const v = d.verification;
    const actions: string[] = [];
    if (hasRole(s.role, 'editor') && ['draft', 'verified', 'blocked', 'rejected'].includes(d.status)) actions.push(form(`/drafts/${d.id}/verify`, s.csrf, '', 'Verify evidence', 'inline'));
    if (hasRole(s.role, 'editor') && d.status === 'verified') actions.push(form(`/drafts/${d.id}/gate`, s.csrf, '', 'Apply publication policy', 'inline'));
    if (hasRole(s.role, 'approver') && d.status === 'awaiting_approval') {
      actions.push(form(`/drafts/${d.id}/decide`, s.csrf, `<input type="hidden" name="decision" value="approved"><label for="note-a">Approval note</label><input id="note-a" name="note" type="text">`, 'Approve', 'inline'));
      actions.push(form(`/drafts/${d.id}/decide`, s.csrf, `<input type="hidden" name="decision" value="rejected"><label for="note-r">Rejection note</label><input id="note-r" name="note" type="text">`, 'Reject', 'inline danger'));
    }
    if (hasRole(s.role, 'approver') && d.status === 'approved') actions.push(form(`/drafts/${d.id}/publish`, s.csrf, `<label for="editor">Editorial responsibility — name</label><input id="editor" name="editor" type="text" required><label for="role">Role</label><input id="role" name="role" type="text" required>`, 'Publish (static export)', 'inline'));
    const body = `
<div class="grid c3">${kpi('Status', d.status)}${kpi('Evidence coverage', v ? `${(v.evidenceCoverage * 100).toFixed(0)}%` : '—', v ? `${v.supportedClaims}/${v.materialClaims} claims` : 'not verified')}${kpi('AI-assisted', d.aiAssisted ? 'yes' : 'no', d.modelId ?? '')}</div>
${d.gate ? `<div class="notice ${d.gate.effect === 'deny' ? 'bad' : d.gate.effect === 'allow' ? 'ok' : 'info'}"><strong>Policy gate (${e(rt.policy.id)}): ${e(d.gate.effect)}</strong> — ${e(d.gate.reasons.concat(d.gate.blockers).join('; ') || 'no conditions')}${d.gate.requiresDisclosure ? ' · AI disclosure required' : ''}</div>` : ''}
<div class="card" style="margin-top:16px"><h2>Actions</h2>${actions.length ? actions.join(' ') : '<p class="muted">No actions available for your role at this stage.</p>'}</div>
${v ? `<div class="card" style="margin-top:16px"><h2>Claim verification</h2>${table(['Supported', 'Kind', 'Claim', 'Evidence', 'Reason'], v.claims.map((cl) => [badge(cl.supported ? 'pass' : 'fail'), e(cl.kind), e(cl.text), e(cl.supportedBy.join(', ') || cl.citedEvidence.join(', ') || '—'), e(cl.reason)]))}${v.placeholders.length ? `<p class="muted">Placeholders: ${v.placeholders.map((p) => e(p)).join(' · ')}</p>` : ''}</div>` : ''}
<div class="grid c2" style="margin-top:16px"><div class="card"><h2>Body</h2><pre>${e(d.body)}</pre></div><div class="card"><h2>Evidence passages</h2>${table(['ID', 'Source', 'Authority', 'Passage'], d.evidence.map((ev) => [e(ev.id), e(ev.title ?? ev.locator), badge(ev.authorityLevel), e(ev.text.slice(0, 220))]), 'No evidence attached.')}</div></div>
<div class="card" style="margin-top:16px"><h2>History</h2>${table(['When', 'Actor', 'Action', 'Detail'], rt.ledger.list({ objectType: 'draft', objectId: d.id }).map((ev) => [e(ev.ts.slice(0, 19).replace('T', ' ')), e(ev.actor), `<span class="mono">${e(ev.action)}</span>`, `<span class="mono">${e(JSON.stringify(ev.evidence ?? ev.newState ?? {}).slice(0, 160))}</span>`]))}</div>`;
    return c.html(page(c, d.title, body, `${d.slug} · created ${d.createdAt.slice(0, 10)} by ${d.author ?? 'unknown'}`));
  });
  app.post('/drafts/:id/verify', async (c) => { const s = requireRole(c, 'editor'); await checkCsrf(c); const d = rt.pipeline.verify(ctxFor(s, c.get('requestId')), c.req.param('id')); return c.redirect(`/drafts/${d.id}?ok=${d.verification?.unsupportedClaims ? 'Verified:+' + d.verification.unsupportedClaims + '+unsupported+claim(s)' : 'Verified:+all+claims+supported'}`); });
  app.post('/drafts/:id/gate', async (c) => { const s = requireRole(c, 'editor'); await checkCsrf(c); const d = rt.pipeline.gate(ctxFor(s, c.get('requestId')), c.req.param('id')); return c.redirect(`/drafts/${d.id}?ok=Gate:+${d.gate?.effect}`); });
  app.post('/drafts/:id/decide', async (c) => {
    const s = requireRole(c, 'approver');
    const b = await checkCsrf(c);
    try {
      const d = rt.pipeline.decide(ctxFor(s, c.get('requestId')), c.req.param('id'), b['decision'] === 'approved' ? 'approved' : 'rejected', b['note']);
      return c.redirect(`/drafts/${d.id}?ok=${d.status}`);
    } catch (err) {
      return c.redirect(`/drafts/${c.req.param('id')}?err=${encodeURIComponent((err as Error).message)}`);
    }
  });
  app.post('/drafts/:id/publish', async (c) => {
    const s = requireRole(c, 'approver');
    const b = await checkCsrf(c);
    const adapter = new StaticExportAdapter(options.publishDir ?? '.evidentia/published');
    rt.pipeline.adapters.set(adapter.id, adapter);
    try {
      const { draft } = await rt.pipeline.publish(ctxFor(s, c.get('requestId')), c.req.param('id'), adapter.id, { name: b['editor'] ?? '', role: b['role'] ?? '' });
      return c.redirect(`/drafts/${draft.id}?ok=Published`);
    } catch (err) {
      return c.redirect(`/drafts/${c.req.param('id')}?err=${encodeURIComponent((err as Error).message)}`);
    }
  });

  app.get('/approvals', (c) => {
    const pending = rt.approvals.listPending(tenant);
    const body = `<div class="card"><h2>Pending</h2>${table(['Action', 'Object', 'Requested by', 'When', 'Reason', 'Policy'], pending.map((a) => [e(a.action), a.objectType === 'draft' ? `<a href="/drafts/${a.objectId}">draft</a>` : e(`${a.objectType}/${a.objectId}`), e(a.requestedBy), e(a.requestedAt.slice(0, 16).replace('T', ' ')), e(a.reason ?? ''), e(a.policyId ?? '')]), 'No pending approvals.')}<p class="muted">Approvals are bound to the exact content hash reviewed and cannot be given by the requester (four-eyes). Decide from the draft page.</p></div>`;
    return c.html(page(c, 'Approvals', body));
  });

  app.get('/observatory', (c) => {
    const sets = rt.observatory.listQuerySets(tenant);
    const selected = c.req.query('set') ?? sets.at(-1)?.id;
    let reportHtml = '<p class="muted">No query sets yet. Save one with the CLI: <span class="mono">evidentia observe save --file query-set.json</span></p>';
    if (selected) {
      const r = rt.observatory.report(tenant, selected);
      reportHtml = `<div class="grid c3">${kpi('Observations', r.totalObservations, `${r.from?.slice(0, 10) ?? '–'} → ${r.to?.slice(0, 10) ?? '–'}`)}<div class="card"><h2>Brand mention</h2><div class="kpi">${pct(r.overall.mention)}</div></div><div class="card"><h2>Brand citation</h2><div class="kpi">${pct(r.overall.citation)}</div></div></div>
<div class="card" style="margin-top:16px"><h2>Per model</h2>${table(['Model', 'Mention', 'Citation', 'n'], Object.entries(r.perModel).map(([k, v]) => [e(k), pct(v.mention), pct(v.citation), String(v.n)]))}</div>
<div class="card" style="margin-top:16px"><h2>Per query</h2>${table(['Query', 'Intent', 'Model', 'Mention', 'Citation', 'Avg position'], r.queries.map((q) => [e(q.text), e(q.intent + (q.branded ? ' · branded' : '')), e(`${q.provider}/${q.model}`), pct(q.mention), pct(q.citation), q.averagePosition ? q.averagePosition.toFixed(1) : '—']))}</div>
${r.seriesBreaks.length ? `<div class="notice">Series break: model version changed — ${e(r.seriesBreaks.map((b) => `${b.provider}/${b.model}: ${b.versions.join(' → ')}`).join('; '))}. Do not compare across the break without noting it.</div>` : ''}
<p class="muted">${e(r.method)}</p>`;
    }
    const body = `<div class="card"><h2>Query sets</h2>${table(['Name', 'Version', 'Created', ''], sets.map((q) => [e(q.name), String(q.version), e(q.createdAt.slice(0, 10)), `<a href="/observatory?set=${q.id}">view report</a>`]))}</div><div style="margin-top:16px">${reportHtml}</div>`;
    return c.html(page(c, 'AI visibility', body, 'Repeated sampling through official APIs · Wilson intervals · never a single answer'));
  });

  app.get('/governance', (c) => {
    const systems = rt.systems.list(tenant);
    const models = rt.registry.list(tenant);
    const processing = rt.processing.list(tenant);
    const body = `<div class="grid c3">${kpi('AI systems', systems.length, `${rt.systems.overdueReviews(tenant).length} overdue reviews`)}${kpi('Models', models.length, `${models.filter((m) => m.record.approvalStatus === 'approved').length} approved`)}${kpi('Processing records', processing.length, 'GDPR Art. 30')}</div>
<div class="grid c2" style="margin-top:16px">
<div class="card"><h2>Article 50 transparency</h2><dl class="kv"><dt>Systems with Art. 50 obligations</dt><dd>${systems.filter((s) => s.record.article50Applicable).length}</dd><dt>Disclosure policy</dt><dd>${rt.policy.publication.disclosure.requiredWhenAiAssisted ? 'visible notice + machine-readable marking on all AI-assisted publications' : 'disabled'}</dd><dt>Provenance signing</dt><dd>${rt.signingKey ? `Ed25519 key ${e(rt.signingKey.keyId)}` : '<span class="badge bad">no signing key configured</span>'}</dd></dl></div>
<div class="card"><h2>Data governance</h2><dl class="kv"><dt>Policy</dt><dd>${e(rt.policy.id)} v${rt.policy.version} (${e(rt.policy.jurisdiction)})</dd><dt>Retention (days)</dt><dd class="mono">${e(Object.entries(rt.policy.retentionDays).map(([k, v]) => `${k}=${v}`).join(' '))}</dd><dt>Records of processing</dt><dd>${processing.map((p) => e(p.record.purpose)).join('<br>') || '—'}</dd></dl></div></div>`;
    return c.html(page(c, 'Governance', body, 'AI Act, GDPR and provenance controls — evidence, not badges'));
  });
  app.get('/governance/models', (c) => {
    const s = c.get('session') as Session;
    const models = rt.registry.list(tenant);
    const body = `<div class="card"><h2>Registry</h2>${table(['Model', 'Adapter', 'Hosting', 'Training on inputs', 'DPA', 'Zero retention', 'Data classes', 'Status', ''], models.map((m) => [`<span class="mono">${e(m.record.provider)}/${e(m.record.model)}</span><br><span class="muted">${e(m.record.displayName)}</span>`, e(m.record.adapter), e(m.record.hosting), m.record.dataPolicy.usedForTraining ? badge('bad') : badge('ok'), m.record.dataPolicy.dpaAvailable ? badge('ok') : badge('bad'), m.record.dataPolicy.zeroDataRetention ? badge('ok') : badge('warn'), e(m.record.allowedDataClasses.join(', ')), badge(m.record.approvalStatus), hasRole(s.role, 'admin') ? (m.record.approvalStatus === 'approved' ? form(`/governance/models/${m.id}/status`, s.csrf, `<input type="hidden" name="status" value="suspended"><label for="sn${m.id}">Reason for suspension</label><input id="sn${m.id}" type="text" name="note" required>`, 'Suspend', 'inline danger') : form(`/governance/models/${m.id}/status`, s.csrf, `<input type="hidden" name="status" value="approved"><label for="an${m.id}">Approval note (DPA reference)</label><input id="an${m.id}" type="text" name="note" required>`, 'Approve', 'inline')) : '']))}</div>
<div class="card" style="margin-top:16px"><h2>Policy check</h2>${form('/governance/models/check', s.csrf, `<label for="pm">Model (provider/model)</label><input id="pm" name="model" type="text" required><label for="pc">Data classes (comma separated: public, internal, confidential, personal, special-category)</label><input id="pc" name="classes" type="text" value="internal">`, 'Evaluate')}</div>`;
    return c.html(page(c, 'Model registry', body, 'Provider data-policy metadata drives what each model may process'));
  });
  app.post('/governance/models/:id/status', async (c) => { const s = requireRole(c, 'admin'); const b = await checkCsrf(c); rt.registry.setApprovalStatus(ctxFor(s, c.get('requestId')), c.req.param('id'), (b['status'] ?? 'suspended') as 'approved', b['note']); return c.redirect('/governance/models?ok=Status+updated'); });
  app.post('/governance/models/check', async (c) => {
    const b = await checkCsrf(c);
    const [provider, model] = (b['model'] ?? '').split('/');
    const rec = provider && model ? rt.registry.find(tenant, provider, model) : undefined;
    if (!rec) return c.redirect('/governance/models?err=Model+not+registered');
    const d = evaluateModelAccess(rt.policy, rec.record, (b['classes'] ?? 'internal').split(',').map((x) => x.trim()).filter(Boolean) as DataClass[]);
    return c.redirect(`/governance/models?${d.effect === 'allow' ? 'ok' : 'err'}=${encodeURIComponent(`${d.effect.toUpperCase()} — ${d.matchedRules.join(', ') || d.reasons.join('; ')}`)}`);
  });
  app.get('/governance/systems', (c) => {
    const body = `<div class="card"><h2>AI system register</h2>${table(['System', 'Role', 'Risk', 'Art. 50', 'Model', 'Owner', 'Review', 'Status'], rt.systems.list(tenant).map((s) => [`<strong>${e(s.record.name)}</strong><br><span class="muted">${e(s.record.purpose)}</span>`, e(s.record.deploymentRole), badge(s.record.riskClassification), s.record.article50Applicable ? 'yes' : 'no', `<span class="mono">${e(s.record.provider)}/${e(s.record.model)}</span>`, e(s.record.owner), new Date(s.record.reviewDate).getTime() < Date.now() ? `<span class="badge bad">${e(s.record.reviewDate)}</span>` : e(s.record.reviewDate), badge(s.record.status)]), 'No AI systems registered. Use the CLI: evidentia system register --file system.json')}</div>`;
    return c.html(page(c, 'AI system register', body, 'Inventory with role, risk classification reasoning, oversight and evidence'));
  });
  app.get('/governance/policy', (c) => c.html(page(c, 'Policy', `<div class="card"><h2>${e(rt.policy.title)}</h2><p class="muted">${e(rt.policy.description ?? '')}</p><pre>${e(JSON.stringify(rt.policy, null, 2))}</pre></div>`, `${rt.policy.id} v${rt.policy.version} — machine-readable, versioned, applied by the router and the publication gate`)));

  app.get('/audit', (c) => {
    const v = rt.ledger.verify();
    const events = rt.ledger.list({ tenantId: tenant, limit: 5000 }).slice(-200).reverse();
    const body = `<div class="notice ${v.ok ? 'ok' : 'bad'}">${v.ok ? `Ledger intact — ${v.count} events, head ${e(v.headHash.slice(0, 16))}…` : `LEDGER BROKEN at sequence ${(v as { brokenAt: number }).brokenAt}: ${e((v as { reason: string }).reason)}`}</div><div class="card"><h2>Latest events</h2>${table(['Seq', 'When', 'Actor', 'Action', 'Object', 'Policy', 'Model', 'Hash'], events.map((ev) => [String(ev.seq), e(ev.ts.slice(0, 19).replace('T', ' ')), e(ev.actor), `<span class="mono">${e(ev.action)}</span>`, `<span class="mono">${e(ev.objectType)}/${e(ev.objectId.slice(0, 8))}</span>`, e(ev.policyId ?? ''), e(ev.modelId ?? ''), `<span class="mono">${e(ev.hash.slice(0, 10))}</span>`]))}</div>`;
    return c.html(page(c, 'Audit trail', body, 'Append-only, hash-chained; verified on every load'));
  });

  app.get('/security', (c) => {
    const controls: [string, boolean | 'n/a', string][] = [
      ['Session cookie HttpOnly + SameSite=Strict', true, 'signed HMAC-SHA256, 8 h TTL'],
      ['CSRF double-submit on every mutation', true, 'per-session token'],
      ['Content Security Policy', true, "default-src 'none'; no scripts"],
      ['Role-based access', true, 'viewer / editor / approver / admin'],
      ['Login rate limiting', true, '5 attempts / 15 min per IP'],
      ['Outbound SSRF protection', true, 'safeFetch: private ranges, redirects, size, timeout'],
      ['Prompt-injection quarantine', true, `${rt.store.quarantined(tenant).length} document(s) currently held`],
      ['Secrets in environment only', true, 'never stored in the database'],
      ['Provenance signing key', !!rt.signingKey, rt.signingKey ? rt.signingKey.keyId : 'configure EVIDENTIA_SIGNING_KEY'],
      ['Audit ledger integrity', rt.ledger.verify().ok, 'hash chain verified'],
      ['MFA / SSO', 'n/a', 'not built in — deploy behind an identity-aware proxy (roadmap: OIDC)'],
    ];
    const body = `<div class="card"><h2>Control status</h2>${table(['Control', 'Status', 'Detail'], controls.map(([n, ok, d]) => [e(n), ok === 'n/a' ? badge('info') : badge(ok ? 'ok' : 'bad'), e(d)]))}</div><p class="muted">Vulnerability reports: see SECURITY.md. Threat model: docs/THREAT_MODEL.md.</p>`;
    return c.html(page(c, 'Security', body));
  });

  app.get('/settings', (c) => {
    const body = `<div class="grid c2"><div class="card"><h2>Instance</h2><dl class="kv"><dt>Tenant</dt><dd>${e(tenant)}</dd><dt>Store</dt><dd class="mono">${e(rt.options.dbPath)}</dd><dt>Policy file</dt><dd class="mono">${e(rt.options.policyPath)}</dd><dt>Providers</dt><dd>${e(rt.adapters.map((a) => a.id).join(', '))}</dd></dl></div><div class="card"><h2>Users</h2>${table(['Name', 'Role'], options.users.map((u) => [e(u.name), badge(u.role)]))}<p class="muted">Users are configured through EVIDENTIA_ADMIN_USERS (tokens stored as SHA-256 hashes).</p></div></div>`;
    return c.html(page(c, 'Settings', body));
  });

  app.onError((err, c) => {
    if (err instanceof ForbiddenError) return c.text(`forbidden: ${err.message}`, 403);
    const code = (err as { code?: string }).code;
    if (code === 'not_found') return c.text('not found', 404);
    if (code === 'validation') return c.text(`invalid request: ${err.message}`, 400);
    rt.logger.error('unhandled error', { requestId: c.get('requestId'), message: err.message });
    return c.text('internal error', 500);
  });
  return app;
}

export class ForbiddenError extends Error {}
