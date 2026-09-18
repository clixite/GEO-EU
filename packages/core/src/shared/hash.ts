import { createHash, randomUUID } from 'node:crypto';

/** SHA-256 hex digest of a string or buffer. */
export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Deterministic JSON serialisation: object keys sorted recursively, no whitespace,
 * `undefined` values dropped. Used for fingerprints and audit hashes so that the
 * same logical value always hashes identically regardless of insertion order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Content fingerprint: sha256 over canonical JSON. */
export function fingerprint(value: unknown): string {
  return sha256(canonicalJson(value));
}

/** Opaque, URL-safe identifier (UUID v4). */
export function newId(): string {
  return randomUUID();
}
