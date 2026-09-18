import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isForbiddenAddress, safeFetch } from '../../src/net/safeFetch.ts';

test('forbidden address ranges are recognised', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1', '255.255.255.255', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a00:1', 'not-an-ip'])
    assert.equal(isForbiddenAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2001:4860:4860::8888', '93.184.216.34'])
    assert.equal(isForbiddenAddress(ip), false, ip);
});

const publicResolve = async () => ['93.184.216.34'];
const fakeFetch = (handler: (url: URL, init: RequestInit) => Response): typeof fetch =>
  (async (input: string | URL | Request, init?: RequestInit) => handler(new URL(String(input)), init ?? {})) as typeof fetch;

test('blocks non-https, credentials, localhost, metadata and private resolutions', async () => {
  await assert.rejects(safeFetch('http://example.com/', { resolve: publicResolve }), /scheme "http" not allowed/);
  await assert.rejects(safeFetch('ftp://example.com/', { resolve: publicResolve }), /scheme "ftp" not allowed/);
  await assert.rejects(safeFetch('https://user:pw@example.com/', { resolve: publicResolve }), /credentials in URL/);
  await assert.rejects(safeFetch('https://localhost/x'), /local hostnames/);
  await assert.rejects(safeFetch('https://app.internal/x'), /local hostnames/);
  await assert.rejects(safeFetch('https://169.254.169.254/latest/meta-data'), /non-public address/);
  await assert.rejects(safeFetch('https://[::1]/'), /non-public address/);
  await assert.rejects(safeFetch('https://evil.example/', { resolve: async () => ['93.184.216.34', '10.0.0.5'] }), /non-public address/);
  await assert.rejects(safeFetch('https://other.example/', { resolve: publicResolve, allowedHosts: ['example.com'] }), /not in allowlist/);
});

test('follows redirects only to validated hosts and caps the hop count', async () => {
  let calls = 0;
  const f = fakeFetch((url) => {
    calls += 1;
    if (url.hostname === 'a.example') return new Response(null, { status: 302, headers: { location: 'https://b.example/final' } });
    if (url.hostname === 'b.example') return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
    return new Response(null, { status: 302, headers: { location: 'https://loop.example/' } });
  });
  const r = await safeFetch('https://a.example/', { resolve: publicResolve, fetchImpl: f });
  assert.equal(r.status, 200);
  assert.equal(r.finalUrl, 'https://b.example/final');
  assert.equal(new TextDecoder().decode(r.body), 'ok');
  assert.equal(calls, 2);

  const toPrivate = fakeFetch(() => new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/' } }));
  await assert.rejects(safeFetch('https://a.example/', { resolve: publicResolve, fetchImpl: toPrivate }), /non-public address/);

  await assert.rejects(safeFetch('https://loop.example/', { resolve: publicResolve, fetchImpl: f, maxRedirects: 2 }), /too many redirects/);
});

test('enforces the response size cap while streaming', async () => {
  const big = new Uint8Array(2048);
  const f = fakeFetch(() => new Response(big, { status: 200 }));
  await assert.rejects(safeFetch('https://a.example/', { resolve: publicResolve, fetchImpl: f, maxBytes: 1024 }), /exceeds 1024 bytes/);
  const ok = await safeFetch('https://a.example/', { resolve: publicResolve, fetchImpl: f, maxBytes: 4096 });
  assert.equal(ok.body.byteLength, 2048);
});

test('sends the Evidentia user agent and honours allowHttp for explicitly trusted hosts', async () => {
  let ua = '';
  const f = fakeFetch((_url, init) => {
    ua = String((init.headers as Record<string, string>)['user-agent']);
    return new Response('x', { status: 200 });
  });
  const r = await safeFetch('http://public.example/', { resolve: publicResolve, fetchImpl: f, allowHttp: true });
  assert.equal(r.status, 200);
  assert.match(ua, /^EvidentiaBot\//);
});
