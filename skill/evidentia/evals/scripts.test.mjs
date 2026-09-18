// Tests for the skill scripts: package validity, digest rendering, install/verify/uninstall round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILL_DIR, validatePackage, listFiles, parseFrontmatter } from '../scripts/lib.mjs';
import { digest } from '../scripts/readiness-digest.mjs';

const run = (script, args, env = {}) => spawnSync(process.execPath, [join(SKILL_DIR, 'scripts', script), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

test('package validates: frontmatter, manifest, size budget, and no undeclared files', () => {
  const v = validatePackage(SKILL_DIR);
  assert.deepEqual(v.problems, []);
  assert.equal(v.name, 'evidentia');
  const manifest = JSON.parse(readFileSync(join(SKILL_DIR, 'evals', 'expected-artifacts.json'), 'utf8'));
  const actual = listFiles(SKILL_DIR);
  assert.deepEqual(actual, [...manifest.files].sort(), 'every file in the package must be declared (and vice versa)');
  const fm = parseFrontmatter(readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8'));
  assert.ok(fm.description.length <= 1024);
  assert.match(fm.description, /Use when/);
});

test('trigger cases are well formed', () => {
  const cases = JSON.parse(readFileSync(join(SKILL_DIR, 'evals', 'trigger-cases.json'), 'utf8'));
  assert.ok(cases.shouldTrigger.length >= 10);
  assert.ok(cases.shouldNotTrigger.length >= 3);
  const modes = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  for (const c of cases.shouldTrigger) assert.ok(modes.includes(`| ${c.expectedMode} |`), `mode ${c.expectedMode} exists in SKILL.md`);
});

test('every referenced reference file exists and is under 250 lines', () => {
  const refs = readdirSync(join(SKILL_DIR, 'references'));
  assert.equal(refs.length, 10);
  for (const r of refs) {
    const lines = readFileSync(join(SKILL_DIR, 'references', r), 'utf8').split('\n').length;
    assert.ok(lines <= 250, `${r} has ${lines} lines`);
  }
});

test('readiness digest renders a prioritised Markdown summary', () => {
  const report = {
    url: 'https://www.example.com/x', version: 'readiness-v1', score: 61, deterministicScore: 61, penalties: 5, qualityAssessed: false, blockedSearchEngines: ['ChatGPT search'],
    dimensions: [{ dimension: 'retrievability', points: 12, maxPoints: 30 }],
    checks: [
      { id: 'R1', dimension: 'retrievability', title: 'AI search crawlers allowed', tier: 'B', status: 'warn', points: 5, maxPoints: 10, evidence: 'blocked: OAI-SearchBot', recommendation: 'Allow OAI-SearchBot.' },
      { id: 'H1', dimension: 'hygiene', title: 'No keyword stuffing', tier: 'A-conditional', status: 'fail', points: -5, maxPoints: 5, evidence: 'top term 6%', recommendation: 'Reduce repetition.' },
      { id: 'I1', dimension: 'informational', title: 'llms.txt present', tier: 'E', status: 'info', points: 0, maxPoints: 0, evidence: 'absent (no evidence it matters)' },
    ],
  };
  const md = digest(report);
  assert.match(md, /Score 61\/100/);
  assert.match(md, /Blocked for AI search:\*\* ChatGPT search/);
  assert.match(md, /1\. \*\*AI search crawlers allowed\*\* \(B, 5 pts\)/);
  assert.match(md, /2\. \*\*No keyword stuffing\*\* \(A-conditional, 5 pts\)/);
  assert.match(md, /llms\.txt present: absent/);
});

test('install → verify → uninstall round trip in an isolated directory, with backup on upgrade', () => {
  const home = mkdtempSync(join(tmpdir(), 'evidentia-skill-'));
  const target = join(home, 'skills', 'evidentia');
  const a = run('install.mjs', ['--target-dir', target, '--json']);
  assert.equal(a.status, 0, a.stderr + a.stdout);
  assert.ok(existsSync(join(target, 'SKILL.md')));
  const v = run('verify-install.mjs', ['--target-dir', target, '--json']);
  assert.equal(v.status, 0, v.stdout);
  writeFileSync(join(target, 'SKILL.md'), '---\nname: evidentia\ndescription: tampered\n---\n');
  const drift = run('verify-install.mjs', ['--target-dir', target, '--json']);
  assert.equal(drift.status, 1);
  assert.match(drift.stdout, /"mismatched": \[\s*"SKILL.md"/);
  const b = run('install.mjs', ['--target-dir', target, '--json']);
  assert.equal(b.status, 0);
  const out = JSON.parse(b.stdout);
  assert.ok(out.results[0].backup && existsSync(out.results[0].backup), 'upgrade keeps a backup');
  assert.equal(run('verify-install.mjs', ['--target-dir', target]).status, 0);
  const u = run('uninstall.mjs', ['--target-dir', target, '--json']);
  assert.equal(u.status, 0);
  assert.ok(!existsSync(target));
});

test('check-environment reports readiness without a store and never throws', () => {
  const r = run('check-environment.mjs', ['--json'], { EVIDENTIA_DB: resolve(tmpdir(), 'does-not-exist.db') });
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.node.ok, true);
  assert.equal(out.store.exists, false);
  assert.equal(out.cli.found, true, 'CLI resolves from the repository layout');
});
