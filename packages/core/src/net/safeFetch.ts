import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * SSRF-hardened outbound HTTP.
 *
 * Every URL the platform fetches on behalf of a tenant (knowledge sources,
 * webhooks, provider endpoints, publishing targets) goes through here:
 * - scheme allowlist (https by default; http only when explicitly enabled);
 * - optional host allowlist per purpose;
 * - DNS resolution with rejection of loopback, link-local (incl. cloud metadata
 *   169.254.169.254), private, CGNAT, multicast, unspecified and IPv4-mapped ranges;
 * - manual redirect following (max 3) with re-validation of every hop;
 * - hard timeout and response-size cap enforced while streaming.
 *
 * Residual risk: DNS rebinding between our lookup and the socket connect. Deploy
 * behind an egress allowlist/proxy for the strongest guarantee; this module makes
 * the common cases fail closed.
 */

export interface SafeFetchOptions {
  allowedHosts?: readonly string[];
  allowHttp?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  body?: string | Uint8Array;
  /** Test seam: resolve a hostname to addresses. Defaults to dns.lookup(all). */
  resolve?: (host: string) => Promise<string[]>;
  /** Test seam: the underlying fetch. */
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

export interface SafeFetchResult {
  status: number;
  headers: Headers;
  body: Uint8Array;
  finalUrl: string;
  contentType: string | null;
}

const DEFAULT_UA = 'EvidentiaBot/1.0 (+https://evidentia.clixite.eu/bot)';

export function isForbiddenAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isForbiddenV4(address);
  if (family === 6) return isForbiddenV6(address);
  return true;
}

function isForbiddenV4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  const [a = 0, b = 0] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isForbiddenV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7);
    return isIP(mapped) === 4 ? isForbiddenV4(mapped) : true;
  }
  const first = parseInt(lower.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // multicast
  if (first === 0x2002) return true; // 6to4 (could embed private v4)
  if (lower.startsWith('64:ff9b:')) return true; // NAT64 well-known prefix
  return false;
}

async function defaultResolve(host: string): Promise<string[]> {
  if (isIP(host)) return [host];
  const results = await lookup(host, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

function normaliseHost(hostname: string): string {
  // URL.hostname keeps IPv6 brackets; strip them for validation.
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

async function validateUrl(raw: string, options: SafeFetchOptions): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EvidentiaError('network_blocked', 'invalid URL', { url: raw });
  }
  const scheme = url.protocol.replace(':', '');
  if (scheme !== 'https' && !(scheme === 'http' && options.allowHttp)) {
    throw new EvidentiaError('network_blocked', `scheme "${scheme}" not allowed`, { url: raw });
  }
  if (url.username || url.password) {
    throw new EvidentiaError('network_blocked', 'credentials in URL are not allowed', { url: url.host });
  }
  const host = normaliseHost(url.hostname);
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new EvidentiaError('network_blocked', 'local hostnames are not allowed', { host });
  }
  if (options.allowedHosts && !options.allowedHosts.some((h) => host === h.toLowerCase() || host.endsWith('.' + h.toLowerCase()))) {
    throw new EvidentiaError('network_blocked', 'host not in allowlist', { host });
  }
  if (isIP(host)) {
    if (isForbiddenAddress(host)) throw new EvidentiaError('network_blocked', 'destination resolves to a non-public address', { host });
    return url;
  }
  const resolve = options.resolve ?? defaultResolve;
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new EvidentiaError('network_blocked', 'hostname could not be resolved', { host });
  }
  if (addresses.length === 0) throw new EvidentiaError('network_blocked', 'hostname resolved to nothing', { host });
  const bad = addresses.find(isForbiddenAddress);
  if (bad) throw new EvidentiaError('network_blocked', 'destination resolves to a non-public address', { host });
  return url;
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new EvidentiaError('network_blocked', `response exceeds ${maxBytes} bytes`, { maxBytes });
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  let url = await validateUrl(rawUrl, options);
  let redirects = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (;;) {
      const response = await fetchImpl(url, {
        method: options.method ?? 'GET',
        headers: { 'user-agent': options.userAgent ?? DEFAULT_UA, accept: 'text/html,application/json,text/plain,*/*;q=0.5', ...options.headers },
        body: options.body ?? null,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new EvidentiaError('network_blocked', 'redirect without location', { status: response.status });
        if (++redirects > maxRedirects) throw new EvidentiaError('network_blocked', 'too many redirects', { maxRedirects });
        url = await validateUrl(new URL(location, url).toString(), options);
        continue;
      }
      const body = await readCapped(response, maxBytes);
      return { status: response.status, headers: response.headers, body, finalUrl: url.toString(), contentType: response.headers.get('content-type') };
    }
  } catch (error) {
    if (error instanceof EvidentiaError) throw error;
    if ((error as { name?: string }).name === 'AbortError') {
      throw new EvidentiaError('network_blocked', `request timed out after ${timeoutMs} ms`, { url: url.host });
    }
    throw new EvidentiaError('provider_unavailable', 'outbound request failed', { url: url.host, cause: (error as Error).message });
  } finally {
    clearTimeout(timer);
  }
}
