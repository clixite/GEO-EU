#!/usr/bin/env node
// Preflight: Node version, CLI location, store, policy. Exit 0 when ready, 1 otherwise.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { locateCli, parseFlags, runCli, output } from './lib.mjs';

const { flags } = parseFlags(process.argv.slice(2));
const [major] = process.versions.node.split('.').map(Number);
const cli = locateCli();
const db = process.env.EVIDENTIA_DB ?? resolve('.evidentia/evidentia.db');
const result = {
  node: { version: process.versions.node, ok: major >= 24 },
  cli: cli ? { found: true, kind: cli.kind, path: cli.path } : { found: false, hint: 'set EVIDENTIA_CLI=<repo>/packages/cli/bin/evidentia.mjs or run from the Evidentia repository' },
  store: { path: db, exists: existsSync(db), hint: existsSync(db) ? undefined : 'run: evidentia init' },
  policy: process.env.EVIDENTIA_POLICY ?? 'governance/policies/eu-default.yaml (default)',
  tenant: process.env.EVIDENTIA_TENANT ?? 'default',
  ready: false,
};
if (result.node.ok && cli) {
  const v = runCli(['version']);
  result.cli.version = v.ok ? JSON.parse(v.stdout).evidentia : null;
  if (existsSync(db)) {
    const s = runCli(['status', '--json']);
    result.status = s.ok ? JSON.parse(s.stdout) : { error: s.stderr.trim() };
  }
}
result.ready = result.node.ok && !!cli && result.store.exists;
output(result, flags, (r) => [
  `Node ${r.node.version} ${r.node.ok ? 'ok' : 'TOO OLD (need 24+)'}`,
  r.cli.found ? `CLI ${r.cli.version ?? '?'} at ${r.cli.path} (${r.cli.kind})` : `CLI not found — ${r.cli.hint}`,
  `Store ${r.store.path} ${r.store.exists ? 'present' : 'missing — ' + r.store.hint}`,
  `Policy ${r.policy} · tenant ${r.tenant}`,
  r.status && !r.status.error ? `Knowledge: ${r.status.knowledge.documents} documents, ${r.status.knowledge.claims} claims · models ${r.status.models.length} · pending approvals ${r.status.pendingApprovals} · ledger ${r.status.ledger.ok ? 'intact' : 'BROKEN'}` : '',
  r.ready ? 'READY' : 'NOT READY',
].filter(Boolean).join('\n'));
process.exit(result.ready ? 0 : 1);
