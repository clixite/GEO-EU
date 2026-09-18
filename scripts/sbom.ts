/**
 * Generate a CycloneDX 1.5 SBOM for the whole workspace from pnpm-lock.yaml and
 * the installed package manifests. Dependency-free apart from the `yaml` parser.
 *
 *   node scripts/sbom.ts [--out dist/sbom.cdx.json]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';

interface LockPackage { resolution?: { integrity?: string; tarball?: string }; dev?: boolean; }
interface Lock { packages?: Record<string, LockPackage>; importers?: Record<string, unknown>; }

export interface Component { type: 'library'; name: string; version: string; purl: string; licenses: { license: { id?: string; name?: string } }[]; hashes: { alg: string; content: string }[]; }

/** "name@version(peer-suffix)" → { name, version } */
export function parseLockKey(key: string): { name: string; version: string } {
  const base = key.replace(/\(.*$/, '');
  const at = base.lastIndexOf('@');
  return { name: base.slice(0, at), version: base.slice(at + 1) };
}

let pnpmDirs: string[] | null = null;
function findInstalledDir(root: string, name: string, version: string): string | null {
  const store = resolve(root, 'node_modules/.pnpm');
  if (!existsSync(store)) return null;
  pnpmDirs ??= readdirSync(store);
  const prefix = `${name.replace('/', '+')}@${version}`;
  const dir = pnpmDirs.find((d) => d === prefix || d.startsWith(prefix + '_'));
  return dir ? join(store, dir, 'node_modules', name) : null;
}

export function isInstalled(root: string, name: string, version: string): boolean {
  const dir = findInstalledDir(root, name, version);
  return !!dir && existsSync(join(dir, 'package.json'));
}

function installedLicense(root: string, name: string, version: string): string | null {
  const dir = findInstalledDir(root, name, version);
  if (!dir) return null;
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) return null;
  try {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as { license?: string | { type?: string }; licenses?: { type?: string }[] };
    if (typeof pkg.license === 'string') return pkg.license;
    if (pkg.license && typeof pkg.license === 'object' && pkg.license.type) return pkg.license.type;
    if (pkg.licenses?.[0]?.type) return pkg.licenses[0].type;
  } catch { /* fall through */ }
  return null;
}

export function collectComponents(root: string): Component[] {
  const lock = parse(readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8')) as Lock;
  const out: Component[] = [];
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    const { name, version } = parseLockKey(key);
    const license = installedLicense(root, name, version);
    const hashes: Component['hashes'] = [];
    const integrity = entry.resolution?.integrity;
    if (integrity?.startsWith('sha512-')) hashes.push({ alg: 'SHA-512', content: Buffer.from(integrity.slice(7), 'base64').toString('hex') });
    out.push({ type: 'library', name, version, purl: `pkg:npm/${name}@${version}`, licenses: license ? [{ license: /^[A-Za-z0-9.+-]+$/.test(license) ? { id: license } : { name: license } }] : [], hashes });
  }
  return out.sort((a, b) => a.purl.localeCompare(b.purl));
}

export function buildSbom(root: string): Record<string, unknown> {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { name: string; version: string };
  const components = collectComponents(root);
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: 'Clixite SRL', name: 'evidentia-sbom', version: '1.0.0' }],
      component: { type: 'application', name: 'evidentia', version: pkg.version, supplier: { name: 'Clixite SRL', url: ['https://clixite.eu'] }, purl: `pkg:generic/evidentia@${pkg.version}` },
    },
    components,
  };
}

const self = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
if (process.argv[1] && resolve(process.argv[1]) === resolve(self)) {
  const root = resolve(dirname(self), '..');
  const outIdx = process.argv.indexOf('--out');
  const outFile = resolve(root, outIdx !== -1 ? (process.argv[outIdx + 1] as string) : 'dist/sbom.cdx.json');
  const sbom = buildSbom(root);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(sbom, null, 2));
  const components = sbom['components'] as Component[];
  process.stdout.write(`SBOM written to ${outFile}: ${components.length} components, ${components.filter((c) => c.licenses.length === 0).length} without licence metadata\n`);
}
