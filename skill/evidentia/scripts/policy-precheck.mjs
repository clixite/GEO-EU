#!/usr/bin/env node
// Explain whether a registered model may process the given data classes under the active policy.
import { parseFlags, runCli, output } from './lib.mjs';

const { flags } = parseFlags(process.argv.slice(2));
if (!flags.provider || !flags.model || !flags.classes) { process.stderr.write('usage: policy-precheck.mjs --provider p --model m --classes public,internal [--json]\n'); process.exit(2); }
const args = ['policy', 'check', '--provider', flags.provider, '--model', flags.model, '--classes', flags.classes, '--json'];
for (const k of ['db', 'tenant', 'policy']) if (typeof flags[k] === 'string') args.push(`--${k}`, flags[k]);
const r = runCli(args);
if (!r.ok) { process.stderr.write(r.stderr || `evidentia exited ${r.code}\n`); process.exit(r.code || 1); }
const d = JSON.parse(r.stdout);
output(d, flags, (x) => `${x.effect.toUpperCase()} under ${x.policyId} v${x.policyVersion}${x.matchedRules.length ? ` (rules: ${x.matchedRules.join(', ')})` : ''}${x.reasons.length ? `\n- ${x.reasons.join('\n- ')}` : ''}`);
process.exit(d.effect === 'allow' ? 0 : 3);
