import { safeFetch, type SafeFetchOptions } from '../net/safeFetch.ts';
import { EvidentiaError } from '../shared/errors.ts';

/**
 * Shared HTTP plumbing for vendor adapters: every call goes through safeFetch
 * with the vendor host pinned as the only allowed host, a bounded timeout and
 * response size, and error mapping that never echoes request bodies or secrets.
 */
export async function postJson<T>(url: string, body: unknown, headers: Record<string, string>, options: SafeFetchOptions = {}): Promise<T> {
  const host = new URL(url).hostname;
  const res = await safeFetch(url, {
    timeoutMs: 60_000,
    maxBytes: 20 * 1024 * 1024,
    ...options,
    method: 'POST',
    allowedHosts: options.allowedHosts ?? [host],
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = new TextDecoder().decode(res.body);
  if (res.status === 429 || res.status >= 500) {
    throw new EvidentiaError('provider_unavailable', `provider responded ${res.status}`, { status: res.status, host });
  }
  if (res.status < 200 || res.status >= 300) {
    let message = `provider responded ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string; type?: string } };
      if (parsed.error?.message) message += `: ${parsed.error.message.slice(0, 200)}`;
    } catch { /* keep generic message */ }
    throw new EvidentiaError('provider_error', message, { status: res.status, host });
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new EvidentiaError('provider_error', 'provider returned non-JSON body', { host });
  }
}

export function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}
