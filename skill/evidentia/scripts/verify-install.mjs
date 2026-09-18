#!/usr/bin/env node
// Verify that an installed copy matches this package byte for byte and has valid frontmatter.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_DIR, parseFlags, validatePackage, targetDir, sha256File, output } from './lib.mjs';

const { flags } = parseFlags(process.argv.slice(2));
const scope = flags.scope === 'project' ? 'project' : 'user';
const target = typeof flags['target-dir'] === 'string' ? flags['target-dir'] : targetDir(scope, flags.agents ? 'agents' : 'claude');
if (!existsSync(target)) { output({ target, installed: false }, flags, () => `not installed at ${target}`); process.exit(1); }
const manifest = JSON.parse(readFileSync(join(SKILL_DIR, 'evals', 'expected-artifacts.json'), 'utf8'));
const missing = manifest.files.filter((f) => !existsSync(join(target, f)));
const mismatched = manifest.files.filter((f) => !missing.includes(f) && sha256File(join(SKILL_DIR, f)) !== sha256File(join(target, f)));
const validation = validatePackage(target);
const ok = missing.length === 0 && mismatched.length === 0 && validation.ok;
output({ target, installed: true, ok, missing, mismatched, validation }, flags, (r) => `${r.ok ? 'VERIFIED' : 'DRIFT DETECTED'}: ${r.target}${r.missing.length ? `\n  missing: ${r.missing.join(', ')}` : ''}${r.mismatched.length ? `\n  changed: ${r.mismatched.join(', ')}` : ''}${r.validation.problems.length ? `\n  ${r.validation.problems.join('\n  ')}` : ''}`);
process.exit(ok ? 0 : 1);
