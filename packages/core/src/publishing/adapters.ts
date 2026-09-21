import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeFetch, type SafeFetchOptions } from '../net/safeFetch.ts';
import type { SecretResolver } from '../providers/types.ts';
import type { SignedManifest } from '../governance/provenance.ts';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * Publishing targets. Every adapter receives finished artefacts (HTML with
 * disclosure marking, Markdown, signed manifest) and returns a receipt that the
 * pipeline stores and audits. Network adapters go through safeFetch with a host
 * allowlist equal to the configured target, and authenticate with secrets
 * resolved by name (never stored in the database).
 */

export interface PublishInput {
  slug: string;
  title: string;
  html: string;
  markdown: string;
  language: string;
  manifest: SignedManifest | null;
  metadata: Record<string, unknown>;
  requestId: string;
}

export interface PublishReceipt {
  target: string;
  remoteId: string | null;
  url: string | null;
  receipt: Record<string, unknown>;
}

export interface PublishAdapter {
  readonly id: string;
  publish(input: PublishInput): Promise<PublishReceipt>;
}

/** Writes `<dir>/<slug>.html`, `.md` and `.manifest.json` — for static sites and CI pipelines. */
export class StaticExportAdapter implements PublishAdapter {
  readonly id: string;
  readonly dir: string;
  constructor(dir: string, id = 'static-export') {
    this.dir = dir;
    this.id = id;
  }
  async publish(input: PublishInput): Promise<PublishReceipt> {
    if (!/^[a-z0-9][a-z0-9-]{0,120}$/.test(input.slug)) throw new EvidentiaError('validation', 'slug must be lowercase letters, digits and hyphens');
    await mkdir(this.dir, { recursive: true });
    const files = [`${input.slug}.html`, `${input.slug}.md`];
    await writeFile(join(this.dir, files[0] as string), input.html, 'utf8');
    await writeFile(join(this.dir, files[1] as string), input.markdown, 'utf8');
    if (input.manifest) {
      files.push(`${input.slug}.manifest.json`);
      await writeFile(join(this.dir, files[2] as string), JSON.stringify(input.manifest, null, 2), 'utf8');
    }
    return { target: this.id, remoteId: null, url: null, receipt: { dir: this.dir, files } };
  }
}

/** WordPress REST API (application passwords). Secret name resolves to "user:app-password". */
export class WordPressAdapter implements PublishAdapter {
  readonly id: string;
  readonly baseUrl: URL;
  readonly secretName: string;
  readonly secrets: SecretResolver;
  readonly fetchOptions: SafeFetchOptions;
  constructor(options: { baseUrl: string; secretName: string; secrets: SecretResolver; id?: string; fetchOptions?: SafeFetchOptions }) {
    this.baseUrl = new URL(options.baseUrl);
    this.secretName = options.secretName;
    this.secrets = options.secrets;
    this.id = options.id ?? `wordpress:${this.baseUrl.hostname}`;
    this.fetchOptions = options.fetchOptions ?? {};
  }
  async publish(input: PublishInput): Promise<PublishReceipt> {
    const credential = this.secrets.require(this.secretName);
    const endpoint = new URL('/wp-json/wp/v2/posts', this.baseUrl).toString();
    const body = JSON.stringify({ title: input.title, slug: input.slug, content: input.html, status: 'publish', meta: { evidentia_request_id: input.requestId, evidentia_content_hash: input.manifest?.manifest.contentHash ?? null } });
    const res = await safeFetch(endpoint, {
      ...this.fetchOptions,
      method: 'POST',
      allowedHosts: [this.baseUrl.hostname],
      headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(credential).toString('base64')}`, 'x-evidentia-request-id': input.requestId },
      body,
    });
    if (res.status < 200 || res.status >= 300) throw new EvidentiaError('provider_error', `WordPress responded ${res.status}`, { status: res.status });
    const json = JSON.parse(new TextDecoder().decode(res.body)) as { id?: number; link?: string };
    return { target: this.id, remoteId: json.id ? String(json.id) : null, url: json.link ?? null, receipt: { status: res.status, id: json.id ?? null } };
  }
}

/** Generic HTTP target: POST JSON with an HMAC-SHA256 signature header the receiver can verify. */
export class GenericHttpAdapter implements PublishAdapter {
  readonly id: string;
  readonly url: URL;
  readonly secretName: string;
  readonly secrets: SecretResolver;
  readonly fetchOptions: SafeFetchOptions;
  constructor(options: { url: string; secretName: string; secrets: SecretResolver; id?: string; fetchOptions?: SafeFetchOptions }) {
    this.url = new URL(options.url);
    this.secretName = options.secretName;
    this.secrets = options.secrets;
    this.id = options.id ?? `http:${this.url.hostname}`;
    this.fetchOptions = options.fetchOptions ?? {};
  }
  async publish(input: PublishInput): Promise<PublishReceipt> {
    const secret = this.secrets.require(this.secretName);
    const payload = JSON.stringify({ slug: input.slug, title: input.title, language: input.language, html: input.html, markdown: input.markdown, manifest: input.manifest, metadata: input.metadata, requestId: input.requestId });
    const timestamp = new Date().toISOString();
    const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
    const res = await safeFetch(this.url.toString(), {
      ...this.fetchOptions,
      method: 'POST',
      allowedHosts: [this.url.hostname],
      headers: { 'content-type': 'application/json', 'x-evidentia-timestamp': timestamp, 'x-evidentia-signature': `sha256=${signature}`, 'x-evidentia-request-id': input.requestId },
      body: payload,
    });
    if (res.status < 200 || res.status >= 300) throw new EvidentiaError('provider_error', `target responded ${res.status}`, { status: res.status });
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(new TextDecoder().decode(res.body)) as Record<string, unknown>; } catch { /* non-JSON receipt is fine */ }
    return { target: this.id, remoteId: typeof json['id'] === 'string' ? json['id'] : null, url: typeof json['url'] === 'string' ? json['url'] : null, receipt: { status: res.status, ...json } };
  }
}

/** Verify a GenericHttpAdapter signature on the receiving side (reference implementation). */
export function verifyGenericSignature(secret: string, timestamp: string, payload: string, header: string, maxSkewMs = 5 * 60_000): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  const skew = Math.abs(Date.now() - new Date(timestamp).getTime());
  return diff === 0 && Number.isFinite(skew) && skew <= maxSkewMs;
}
