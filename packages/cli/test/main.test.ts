import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, parseArgs, usage } from '../src/main.ts';

async function run(args: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = '';
  let err = '';
  const code = await main(args, { stdout: (s) => { out += s; }, stderr: (s) => { err += s; } });
  return { code, out, err };
}

test('parseArgs handles flags, --key=value, booleans and positionals', () => {
  const p = parseArgs(['draft', 'show', 'abc', '--db', 'x.db', '--json', '--k=3', 'trailing', '--verbose']);
  assert.deepEqual(p.positionals, ['draft', 'show', 'abc', 'trailing']);
  assert.deepEqual(p.flags, { db: 'x.db', json: true, k: '3', verbose: true });
  // A bare flag followed by a non-flag token takes it as its value (documented behaviour).
  assert.deepEqual(parseArgs(['--tenant', 'acme', '--json']).flags, { tenant: 'acme', json: true });
});

test('help and unknown commands use exit code 2 without touching a store', async () => {
  const help = await run(['help']);
  assert.equal(help.code, 0);
  assert.match(help.out, /Built and maintained by Clixite SRL/);
  const none = await run([]);
  assert.equal(none.code, 2);
  const unknown = await run(['frobnicate']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /unknown command/);
  assert.match(usage(), /Exit codes/);
});

test('commands other than init refuse to run without a store', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidentia-cli-'));
  const r = await run(['status', '--db', join(dir, 'missing.db')]);
  assert.equal(r.code, 2);
  assert.match(r.err, /run "evidentia init" first/);
});

test('init creates the store and signing key; status and audit verify succeed; policy denial exits 3', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidentia-cli-'));
  const db = join(dir, 'store.db');
  const init = await run(['init', '--db', db, '--tenant', 't', '--json']);
  assert.equal(init.code, 0, init.err);
  assert.ok(existsSync(db));
  assert.ok(existsSync(join(dir, 'signing-key.json')));
  const key = JSON.parse(readFileSync(join(dir, 'signing-key.json'), 'utf8')) as { keyId: string; privateKeyPem: string };
  assert.match(key.privateKeyPem, /BEGIN PRIVATE KEY/);
  const status = await run(['status', '--db', db, '--tenant', 't', '--json']);
  assert.equal(status.code, 0);
  const parsed = JSON.parse(status.out) as { ledger: { ok: boolean }; models: string[] };
  assert.equal(parsed.ledger.ok, true);
  assert.ok(parsed.models.some((m) => m.startsWith('local/hash-384')));
  const audit = await run(['audit', 'verify', '--db', db, '--tenant', 't', '--json']);
  assert.equal(audit.code, 0);
  const denied = await run(['policy', 'check', '--provider', 'local', '--model', 'hash-384', '--classes', 'public', '--db', db, '--tenant', 't', '--json']);
  assert.equal(denied.code, 0);
  assert.equal((JSON.parse(denied.out) as { effect: string }).effect, 'allow');
  const generate = await run(['draft', 'generate', '--title', 'T', '--slug', 't', '--query', 'anything', '--db', db, '--tenant', 't']);
  assert.equal(generate.code, 3, 'no chat-capable model registered → policy denied');
  assert.match(generate.err, /policy_denied/);
});

test('validation errors exit 2 with usage hints', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidentia-cli-'));
  const db = join(dir, 'store.db');
  await run(['init', '--db', db]);
  const r = await run(['source', 'delete', '--db', db]);
  assert.equal(r.code, 2);
  assert.match(r.err, /usage: source delete/);
  const erase = await run(['erase', 'tenant', '--reason', 'x', '--db', db]);
  assert.equal(erase.code, 2, 'erase requires --confirm');
});
