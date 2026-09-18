// Shared helpers for Evidentia skill scripts. Plain ESM, Node 24+, no dependencies.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseFlags(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[a.slice(2)] = next; i += 1; } else flags[a.slice(2)] = true;
    } else positionals.push(a);
  }
  return { positionals, flags };
}

/** Locate the evidentia CLI: EVIDENTIA_CLI, repo layout relative to the skill, or PATH. */
export function locateCli() {
  const env = process.env.EVIDENTIA_CLI;
  if (env && existsSync(env)) return { kind: 'env', path: resolve(env) };
  const repo = resolve(SKILL_DIR, '../../packages/cli/bin/evidentia.mjs');
  if (existsSync(repo)) return { kind: 'repo', path: repo };
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['evidentia'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return { kind: 'path', path: which.stdout.trim().split(/\r?\n/)[0] };
  return null;
}

/** Run the CLI with an argument array (never a shell string). */
export function runCli(args, options = {}) {
  const cli = locateCli();
  if (!cli) return { ok: false, code: 127, stdout: '', stderr: 'evidentia CLI not found: set EVIDENTIA_CLI or run from the repository', cli: null };
  const isPath = cli.kind === 'path';
  const cmd = isPath ? cli.path : process.execPath;
  const full = isPath ? args : ['--disable-warning=ExperimentalWarning', cli.path, ...args];
  const res = spawnSync(cmd, full, { encoding: 'utf8', env: process.env, cwd: options.cwd ?? process.cwd(), maxBuffer: 32 * 1024 * 1024 });
  return { ok: res.status === 0, code: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '', cli: cli.path };
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, base));
    else out.push(p.slice(base.length + 1).replace(/\\/g, '/'));
  }
  return out.sort();
}

export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
}

export function validatePackage(dir) {
  const problems = [];
  const skillPath = join(dir, 'SKILL.md');
  if (!existsSync(skillPath)) return { ok: false, problems: ['SKILL.md missing'] };
  const fm = parseFrontmatter(readFileSync(skillPath, 'utf8'));
  if (!fm) problems.push('SKILL.md has no YAML frontmatter');
  else {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name ?? '') || (fm.name ?? '').length > 64) problems.push('frontmatter name must be 1-64 lowercase letters, digits and single hyphens');
    if (!fm.description || fm.description.length > 1024) problems.push('frontmatter description must be 1-1024 characters');
  }
  const manifestPath = join(dir, 'evals', 'expected-artifacts.json');
  if (!existsSync(manifestPath)) problems.push('evals/expected-artifacts.json missing');
  else {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const f of manifest.files) if (!existsSync(join(dir, f))) problems.push(`declared file missing: ${f}`);
  }
  const lines = readFileSync(skillPath, 'utf8').split(/\r?\n/).length;
  if (lines > 500) problems.push(`SKILL.md is ${lines} lines (> 500)`);
  return { ok: problems.length === 0, problems, name: fm?.name };
}

export function targetDir(scope, kind = 'claude') {
  const root = scope === 'user' ? homedir() : process.cwd();
  return kind === 'agents' ? join(root, '.agents', 'skills', 'evidentia') : join(root, '.claude', 'skills', 'evidentia');
}

export function output(value, flags, human) {
  if (flags.json) process.stdout.write(JSON.stringify(value, null, 2) + '\n');
  else process.stdout.write((human ? human(value) : JSON.stringify(value, null, 2)) + '\n');
}
