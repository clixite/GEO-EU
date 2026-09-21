#!/usr/bin/env node
// Run `evidentia analyze` on a URL or local HTML file and print a Markdown digest.
import { parseFlags, runCli } from './lib.mjs';
import { digest } from './readiness-digest.mjs';

const { positionals, flags } = parseFlags(process.argv.slice(2));
const target = positionals[0];
if (!target) { process.stderr.write('usage: analyze-url.mjs <url|file.html> [--brand name] [--robots file] [--url canonicalUrl] [--json]\n'); process.exit(2); }
const args = ['analyze', target, '--json'];
for (const k of ['brand', 'robots', 'url', 'db', 'tenant', 'actor', 'policy']) if (typeof flags[k] === 'string') args.push(`--${k}`, flags[k]);
const r = runCli(args);
if (!r.ok) { process.stderr.write(r.stderr || `evidentia exited ${r.code}\n`); process.exit(r.code || 1); }
const report = JSON.parse(r.stdout);
process.stdout.write((flags.json ? JSON.stringify(report, null, 2) : digest(report)) + '\n');
