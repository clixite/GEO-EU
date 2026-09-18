#!/usr/bin/env node
// Remove an installed copy by moving it to a timestamped backup folder (reversible).
import { existsSync, renameSync } from 'node:fs';
import { parseFlags, targetDir, output } from './lib.mjs';

const { flags } = parseFlags(process.argv.slice(2));
const scope = flags.scope === 'project' ? 'project' : 'user';
const target = typeof flags['target-dir'] === 'string' ? flags['target-dir'] : targetDir(scope, flags.agents ? 'agents' : 'claude');
if (!existsSync(target)) { output({ target, removed: false }, flags, () => `nothing installed at ${target}`); process.exit(0); }
const backup = `${target}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
renameSync(target, backup);
output({ target, removed: true, backup }, flags, (r) => `removed ${r.target}\nbackup kept at ${r.backup} (rename it back to restore)`);
