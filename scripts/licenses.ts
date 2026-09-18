/**
 * Licence compliance gate: every dependency in the lockfile must carry an
 * allow-listed SPDX licence. Fails (exit 1) on unknown or disallowed licences.
 *
 *   node scripts/licenses.ts [--json]
 */
import { resolve, dirname } from 'node:path';
import { collectComponents, isInstalled } from './sbom.ts';

// LGPL-3.0-or-later: allow-listed only for unmodified, dynamically-invoked native binaries
// (e.g. @img/sharp-*'s bundled libvips) — used as-is via its public API, never statically
// linked into or modified as part of Evidentia's own source. That use does not trigger LGPL's
// copyleft obligations; if a future dependency uses this licence for a statically linked or
// source-embedded component, it needs its own review before relying on this entry.
export const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', 'Python-2.0', 'MPL-2.0', 'CC-BY-4.0', 'MIT-0', 'LGPL-3.0-or-later']);

export type LicenceStatus = 'ok' | 'unknown' | 'disallowed' | 'not-installed';

/**
 * SPDX licence expression evaluator: a package is compliant only if the
 * expression is *satisfiable using only allow-listed licences*. `AND` requires
 * every joined term to be allowed (the recipient owes obligations under both);
 * `OR` requires only one term to be allowed (the recipient may pick either).
 * Treating these the same — as a flat "does any token match" check — wrongly
 * passed "GPL-3.0 AND MIT" because MIT alone matched, when the AND means both
 * licences' terms apply simultaneously. Parenthesised nesting is supported since
 * SPDX requires parens whenever AND and OR are mixed at the same level.
 */
type Expr = { kind: 'id'; id: string } | { kind: 'op'; op: 'AND' | 'OR'; terms: Expr[] };

function tokenize(expr: string): string[] {
  return expr.match(/\(|\)|AND|OR|[^\s()]+/gi) ?? [];
}

function parseExpr(tokens: string[]): Expr {
  let i = 0;
  const parsePrimary = (): Expr => {
    const t = tokens[i];
    if (t === '(') {
      i += 1;
      const inner = parseOr();
      if (tokens[i] === ')') i += 1;
      return inner;
    }
    i += 1;
    return { kind: 'id', id: t ?? '' };
  };
  const parseAnd = (): Expr => {
    const terms = [parsePrimary()];
    while (tokens[i]?.toUpperCase() === 'AND') { i += 1; terms.push(parsePrimary()); }
    return terms.length === 1 ? terms[0]! : { kind: 'op', op: 'AND', terms };
  };
  const parseOr = (): Expr => {
    const terms = [parseAnd()];
    while (tokens[i]?.toUpperCase() === 'OR') { i += 1; terms.push(parseAnd()); }
    return terms.length === 1 ? terms[0]! : { kind: 'op', op: 'OR', terms };
  };
  return parseOr();
}

/** True if the expression can be satisfied entirely with allow-listed licences. */
function satisfiable(node: Expr, allowed: ReadonlySet<string>): boolean {
  if (node.kind === 'id') return allowed.has(node.id.trim());
  if (node.op === 'AND') return node.terms.every((t) => satisfiable(t, allowed));
  return node.terms.some((t) => satisfiable(t, allowed));
}

function isSpdxAllowed(license: string, allowed: ReadonlySet<string>): boolean {
  try {
    return satisfiable(parseExpr(tokenize(license)), allowed);
  } catch {
    return false;
  }
}

/**
 * Packages that are in the lockfile but not installed on this platform (optional
 * platform-specific binaries such as lightningcss-*-musl) cannot be inspected here;
 * they are reported as `not-installed` and do not fail the gate on this machine.
 * CI runs on Linux where its own binaries are present and must pass.
 */
export function evaluate(root: string): { ok: boolean; rows: { name: string; version: string; license: string; status: LicenceStatus }[] } {
  const rows = collectComponents(root).map((c) => {
    const lic = c.licenses[0]?.license;
    const license = lic?.id ?? lic?.name ?? 'UNKNOWN';
    const installed = isInstalled(root, c.name, c.version);
    const status: LicenceStatus = !installed ? 'not-installed' : license === 'UNKNOWN' ? 'unknown' : isSpdxAllowed(license, ALLOWED) ? 'ok' : 'disallowed';
    return { name: c.name, version: c.version, license, status };
  });
  return { ok: rows.every((r) => r.status === 'ok' || r.status === 'not-installed'), rows };
}

const self = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (process.argv[1] && resolve(process.argv[1]) === resolve(self)) {
  const root = resolve(dirname(self), '..');
  const result = evaluate(root);
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  else {
    for (const r of result.rows.filter((x) => x.status !== 'ok' && x.status !== 'not-installed')) process.stdout.write(`${r.status.toUpperCase().padEnd(12)} ${r.name}@${r.version} — ${r.license}\n`);
    const count = (s: LicenceStatus) => result.rows.filter((r) => r.status === s).length;
    process.stdout.write(`${result.rows.length} packages: ${count('ok')} allow-listed, ${count('not-installed')} not installed on this platform, ${count('unknown')} unknown, ${count('disallowed')} disallowed\n`);
  }
  process.exit(result.ok ? 0 : 1);
}
