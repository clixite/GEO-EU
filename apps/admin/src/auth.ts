import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sha256 } from '@evidentia/core';

/**
 * Authentication and session security for the governance console.
 *
 * v1 model: named users with a personal access token (stored hashed) and a role.
 * Login sets a signed, HttpOnly, SameSite=Strict session cookie; forms carry a
 * per-session CSRF token (double submit). Login attempts are rate-limited per IP.
 * SSO/OIDC and MFA are on the roadmap (docs/SECURITY_ARCHITECTURE.md); until then
 * deploy behind an identity-aware proxy for MFA.
 */

export type Role = 'viewer' | 'editor' | 'approver' | 'admin';
const RANK: Record<Role, number> = { viewer: 0, editor: 1, approver: 2, admin: 3 };

export interface UserRecord {
  name: string;
  role: Role;
  /** sha256 hex of the personal access token. */
  tokenHash: string;
}

export interface Session {
  user: string;
  role: Role;
  csrf: string;
  exp: number;
}

export function hashToken(token: string): string {
  return sha256(token);
}

export function hasRole(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}

export class SessionSigner {
  readonly #secret: Buffer;
  readonly ttlMs: number;
  constructor(secret: string, ttlMs = 8 * 60 * 60 * 1000) {
    if (secret.length < 32) throw new Error('EVIDENTIA_ADMIN_SECRET must be at least 32 characters');
    this.#secret = Buffer.from(secret);
    this.ttlMs = ttlMs;
  }
  create(user: UserRecord, now = Date.now()): { session: Session; cookie: string } {
    const session: Session = { user: user.name, role: user.role, csrf: randomBytes(16).toString('hex'), exp: now + this.ttlMs };
    return { session, cookie: this.encode(session) };
  }
  encode(session: Session): string {
    const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
    const sig = createHmac('sha256', this.#secret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }
  verify(cookie: string | undefined, now = Date.now()): Session | null {
    if (!cookie) return null;
    const [payload, sig] = cookie.split('.');
    if (!payload || !sig) return null;
    const expected = createHmac('sha256', this.#secret).update(payload).digest('base64url');
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    try {
      const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
      if (typeof session.exp !== 'number' || session.exp < now) return null;
      return session;
    } catch {
      return null;
    }
  }
}

export class LoginRateLimiter {
  readonly #attempts = new Map<string, { count: number; resetAt: number }>();
  readonly max: number;
  readonly windowMs: number;
  constructor(max = 5, windowMs = 15 * 60 * 1000) {
    this.max = max;
    this.windowMs = windowMs;
  }
  allow(key: string, now = Date.now()): boolean {
    const a = this.#attempts.get(key);
    if (!a || a.resetAt < now) {
      this.#attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    a.count += 1;
    return a.count <= this.max;
  }
  reset(key: string): void {
    this.#attempts.delete(key);
  }
}

export function authenticate(users: readonly UserRecord[], token: string): UserRecord | null {
  const h = Buffer.from(hashToken(token));
  for (const u of users) {
    const uh = Buffer.from(u.tokenHash);
    if (uh.length === h.length && timingSafeEqual(uh, h)) return u;
  }
  return null;
}

/** Parse EVIDENTIA_ADMIN_USERS (JSON array of {name, role, tokenHash}). */
export function parseUsers(json: string | undefined): UserRecord[] {
  if (!json) return [];
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('EVIDENTIA_ADMIN_USERS must be a JSON array');
  return parsed.map((u: { name?: unknown; role?: unknown; tokenHash?: unknown }) => {
    if (typeof u.name !== 'string' || typeof u.tokenHash !== 'string' || !['viewer', 'editor', 'approver', 'admin'].includes(String(u.role))) throw new Error('invalid user record');
    return { name: u.name, role: u.role as Role, tokenHash: u.tokenHash };
  });
}
