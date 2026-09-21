import { escapeHtml } from '@evidentia/core';

/**
 * Server-rendered views. No client-side framework, no inline scripts: the
 * console works with CSP `script-src 'none'`. Design direction: restrained,
 * architectural, data-dense — a governance instrument, not a marketing dashboard.
 */

export const e = escapeHtml;

export const CSS = `
:root{--ink:#14181f;--muted:#5b6472;--line:#d9dee6;--paper:#f6f7f9;--card:#fff;--accent:#0b4f8a;--accent-ink:#fff;--ok:#1f7a4d;--warn:#9a6a00;--bad:#b3261e;--info:#4b5563;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 var(--sans);font-variant-numeric:tabular-nums}
a{color:var(--accent)}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #ffbf47;outline-offset:2px}
.skip{position:absolute;left:-999px;top:8px;background:#fff;padding:8px 12px;border:2px solid var(--accent)}.skip:focus{left:8px;z-index:10}
.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
nav.side{background:#0f1a2b;color:#c9d3e0;padding:20px 16px;position:sticky;top:0;height:100vh;overflow:auto}
nav.side .brand{color:#fff;font-weight:700;letter-spacing:.02em;text-decoration:none;font-size:18px;display:block;margin-bottom:4px}
nav.side .tenant{color:#8ea3bd;font-size:12px;margin-bottom:20px}
nav.side h2{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#8ea3bd;margin:18px 0 6px}
nav.side a{display:block;color:#dbe4ef;text-decoration:none;padding:6px 10px;border-radius:6px;font-size:14px}
nav.side a[aria-current=page],nav.side a:hover{background:#1d2d45;color:#fff}
main{padding:28px 36px;max-width:1280px}
header.page{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:22px}
header.page h1{margin:0;font-size:26px;letter-spacing:-.01em}header.page p{margin:4px 0 0;color:var(--muted)}
.user{font-size:13px;color:var(--muted)}.user form{display:inline}
.grid{display:grid;gap:16px}.grid.c3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.grid.c2{grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px}
.card h2{margin:0 0 10px;font-size:15px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.kpi{font-size:32px;font-weight:700;letter-spacing:-.02em;line-height:1.1}.kpi small{font-size:13px;color:var(--muted);font-weight:400;margin-left:6px}
.table-wrap{overflow-x:auto;max-width:100%}.table-wrap:focus-visible{outline:3px solid #ffbf47}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.mono,dl.kv dd{overflow-wrap:anywhere}pre{max-width:100%}
tr:hover td{background:#fbfcfd}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid transparent}
.badge.ok{background:#e6f4ec;color:var(--ok)}.badge.warn{background:#fff4d6;color:var(--warn)}.badge.bad{background:#fbe9e7;color:var(--bad)}.badge.info{background:#eef0f3;color:var(--info)}.badge.pass{background:#e6f4ec;color:var(--ok)}.badge.fail{background:#fbe9e7;color:var(--bad)}.badge.na{background:#eef0f3;color:var(--info)}
form.inline{display:inline-block;vertical-align:top;margin:4px 8px 4px 0}button,.btn{background:var(--accent);color:var(--accent-ink);border:0;border-radius:6px;padding:10px 16px;min-height:44px;font:inherit;font-weight:600;cursor:pointer;touch-action:manipulation;transition:background-color .18s,box-shadow .18s}button:hover{background:#0a3f6e}button.secondary{background:#e8edf3;color:var(--ink)}button.secondary:hover{background:#dbe3ec}button.danger{background:var(--bad)}button.danger:hover{background:#8f1e17}
nav.side a{min-height:44px;display:flex;align-items:center}
@media (prefers-reduced-motion:reduce){button,.btn,nav.side a{transition:none}}
label{display:block;font-weight:600;font-size:13px;margin:10px 0 4px}input[type=text],input[type=url],input[type=password],textarea,select{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;font:inherit;background:#fff}
textarea{min-height:160px;font-family:var(--mono);font-size:13px}
.mono{font-family:var(--mono);font-size:12.5px}.muted{color:var(--muted)}.right{text-align:right}
.bar{height:8px;background:#e8edf3;border-radius:4px;overflow:hidden}.bar>span{display:block;height:100%;background:var(--accent)}
.notice{border-left:4px solid var(--accent);background:#eef4fa;padding:10px 14px;border-radius:6px;margin:12px 0}.notice.bad{border-color:var(--bad);background:#fbe9e7}.notice.ok{border-color:var(--ok);background:#e6f4ec}
pre{background:#0f1a2b;color:#e6edf5;padding:14px;border-radius:8px;overflow:auto;font-size:12.5px}
footer.foot{margin:40px 0 0;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
dl.kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}dl.kv dt{color:var(--muted)}dl.kv dd{margin:0}
@media (max-width:900px){.shell{grid-template-columns:1fr}nav.side{position:static;height:auto}main{padding:18px;max-width:100vw;overflow-x:hidden}header.page{flex-direction:column;align-items:flex-start}.grid.c2,.grid.c3{grid-template-columns:1fr}}
@media (prefers-reduced-motion:no-preference){nav.side a{transition:background .15s}}
`;

export const NAV: { section: string; items: { href: string; label: string }[] }[] = [
  { section: 'Overview', items: [{ href: '/', label: 'Executive overview' }] },
  { section: 'Knowledge', items: [{ href: '/knowledge', label: 'Knowledge health' }, { href: '/readiness', label: 'GEO readiness' }] },
  { section: 'Content', items: [{ href: '/drafts', label: 'Content pipeline' }, { href: '/approvals', label: 'Approvals' }] },
  { section: 'Visibility', items: [{ href: '/observatory', label: 'AI visibility' }] },
  { section: 'Governance', items: [{ href: '/governance', label: 'Governance' }, { href: '/governance/models', label: 'Model registry' }, { href: '/governance/systems', label: 'AI system register' }, { href: '/governance/policy', label: 'Policy' }] },
  { section: 'Assurance', items: [{ href: '/audit', label: 'Audit trail' }, { href: '/security', label: 'Security' }, { href: '/settings', label: 'Settings' }] },
];

export function layout(opts: { title: string; subtitle?: string; path: string; user: { name: string; role: string } | null; tenant: string; csrf?: string; body: string; flash?: { kind: 'ok' | 'bad' | 'info'; text: string } | null }): string {
  const nav = NAV.map((s) => `<h2>${e(s.section)}</h2>${s.items.map((i) => `<a href="${i.href}"${i.href === opts.path ? ' aria-current="page"' : ''}>${e(i.label)}</a>`).join('')}`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(opts.title)} · Evidentia</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/app.css"></head><body>
<a class="skip" href="#main">Skip to content</a>
<div class="shell"><nav class="side" aria-label="Main navigation"><a class="brand" href="/">Evidentia</a><div class="tenant">Tenant: ${e(opts.tenant)}</div>${nav}</nav>
<main id="main"><header class="page"><div><h1>${e(opts.title)}</h1>${opts.subtitle ? `<p>${e(opts.subtitle)}</p>` : ''}</div><div class="user">${opts.user ? `${e(opts.user.name)} · ${e(opts.user.role)} <form method="post" action="/logout"><input type="hidden" name="csrf" value="${e(opts.csrf ?? '')}"><button class="secondary" type="submit">Sign out</button></form>` : ''}</div></header>
${opts.flash ? `<div class="notice ${opts.flash.kind}" role="status">${e(opts.flash.text)}</div>` : ''}
${opts.body}
<footer class="foot">Evidentia governance console · Built and maintained by Clixite SRL — Belgium · Every action here is recorded in the audit ledger.</footer></main></div></body></html>`;
}

export function loginPage(error?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Evidentia</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/app.css"></head><body><main id="main" style="max-width:420px;margin:10vh auto"><div class="card"><h1 style="margin-top:0">Evidentia</h1><p class="muted">Governance console. Sign in with your personal access token.</p>${error ? `<div class="notice bad" role="alert">${e(error)}</div>` : ''}<form method="post" action="/login"><label for="token">Access token</label><input id="token" name="token" type="password" autocomplete="current-password" required><p><button type="submit">Sign in</button></p></form><p class="muted" style="font-size:12px">Built and maintained by Clixite SRL — Belgium</p></div></main></body></html>`;
}

export function badge(status: string): string {
  const cls = ['pass', 'ok', 'approved', 'published', 'allow'].includes(status) ? 'ok' : ['warn', 'awaiting_approval', 'require_approval', 'verified', 'draft', 'pending'].includes(status) ? 'warn' : ['fail', 'bad', 'blocked', 'rejected', 'deny', 'failed'].includes(status) ? 'bad' : 'info';
  return `<span class="badge ${cls}">${e(status)}</span>`;
}

export function table(headers: string[], rows: string[][], empty = 'Nothing to show yet.'): string {
  if (!rows.length) return `<p class="muted">${e(empty)}</p>`;
  return `<div class="table-wrap" tabindex="0"><table><thead><tr>${headers.map((h) => `<th scope="col">${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function kpi(label: string, value: string | number, hint?: string): string {
  return `<div class="card"><h2>${e(label)}</h2><div class="kpi">${e(String(value))}${hint ? `<small>${e(hint)}</small>` : ''}</div></div>`;
}

export function form(action: string, csrf: string, fields: string, button: string, cls = ''): string {
  return `<form method="post" action="${e(action)}" class="${cls}"><input type="hidden" name="csrf" value="${e(csrf)}">${fields}<button type="submit"${cls.includes('danger') ? ' class="danger"' : ''}>${e(button)}</button></form>`;
}

export function pct(p: { p: number; low: number; high: number; n: number }): string {
  return `${(p.p * 100).toFixed(0)}% <span class="muted">[${(p.low * 100).toFixed(0)}–${(p.high * 100).toFixed(0)}] n=${p.n}</span>`;
}
