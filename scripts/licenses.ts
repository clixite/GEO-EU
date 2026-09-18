/**
 * Licence compliance gate: every dependency in the lockfile must carry an
 * allow-listed SPDX licence. Fails (exit 1) on unknown or disallowed licences.
 *
 *   node scripts/licenses.ts [--json]
 */
import { resolve, dirname } from 'node:path';
import { collectComponents, isInstalled } from './sbom.ts';

export const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', 'Python-2.0', 'MPL-2.0', 'CC-BY-4.0', 'MIT-0']);

export type LicenceStatus = 'ok' | 'unknown' | 'disallowed' | 'not-installed';

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
    const expr = license.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/i);
    const status: LicenceStatus = !installed ? 'not-installed' : license === 'UNKNOWN' ? 'unknown' : expr.some((e) => ALLOWED.has(e.trim())) ? 'ok' : 'disallowed';
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
