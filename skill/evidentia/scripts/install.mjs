#!/usr/bin/env node
// Install or upgrade the Evidentia skill with validation, backup and post-install verification.
import { cpSync, existsSync, mkdirSync, renameSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SKILL_DIR, parseFlags, validatePackage, targetDir, listFiles, sha256File, output } from './lib.mjs';

const { flags } = parseFlags(process.argv.slice(2));
const scope = flags.scope === 'project' ? 'project' : 'user';
const validation = validatePackage(SKILL_DIR);
if (!validation.ok) { process.stderr.write(`package invalid:\n- ${validation.problems.join('\n- ')}\n`); process.exit(1); }
const manifest = JSON.parse(readFileSync(join(SKILL_DIR, 'evals', 'expected-artifacts.json'), 'utf8'));
const targets = [targetDir(scope, 'claude')];
if (flags.agents) targets.push(targetDir(scope, 'agents'));
if (typeof flags['target-dir'] === 'string') targets.splice(0, targets.length, flags['target-dir']);

const results = [];
for (const target of targets) {
  let backup = null;
  if (existsSync(target)) {
    backup = `${target}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    renameSync(target, backup);
  }
  mkdirSync(dirname(target), { recursive: true });
  mkdirSync(target, { recursive: true });
  for (const f of manifest.files) {
    mkdirSync(dirname(join(target, f)), { recursive: true });
    cpSync(join(SKILL_DIR, f), join(target, f));
  }
  const mismatched = manifest.files.filter((f) => sha256File(join(SKILL_DIR, f)) !== sha256File(join(target, f)));
  const extra = listFiles(target).filter((f) => !manifest.files.includes(f));
  results.push({ target, backup, files: manifest.files.length, verified: mismatched.length === 0 && extra.length === 0, mismatched, extra });
}
output({ scope, name: validation.name, results }, flags, (r) => r.results.map((x) => `${x.verified ? 'installed' : 'INSTALL PROBLEM'}: ${x.target} (${x.files} files)${x.backup ? `\n  previous copy kept at ${x.backup}\n  rollback: remove ${x.target} and rename the backup back` : ''}${x.mismatched.length ? `\n  mismatched: ${x.mismatched.join(', ')}` : ''}`).join('\n') + '\nRestart Claude Code to load the skill (/evidentia).');
process.exit(results.every((r) => r.verified) ? 0 : 1);
