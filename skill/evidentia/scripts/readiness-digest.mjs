#!/usr/bin/env node
// Turn a readiness report (JSON from `evidentia analyze --json`) into a Markdown digest.
import { readFileSync } from 'node:fs';
import { parseFlags } from './lib.mjs';

export function digest(report) {
  const failing = report.checks.filter((c) => c.status === 'fail' || c.status === 'warn').filter((c) => c.recommendation);
  const atStake = (c) => (c.dimension === 'hygiene' ? Math.abs(c.points) : c.maxPoints - c.points);
  failing.sort((a, b) => atStake(b) - atStake(a));
  const lines = [
    `## GEO readiness — ${report.url}`,
    '',
    `**Score ${report.score}/100** (deterministic ${report.deterministicScore}; penalties −${report.penalties}; content quality ${report.qualityAssessed ? 'judged' : 'not assessed'}). Version ${report.version}.`,
    report.blockedSearchEngines.length ? `**Blocked for AI search:** ${report.blockedSearchEngines.join(', ')} — nothing else matters until this is fixed.` : 'All documented AI search agents may fetch this page (robots.txt evaluated per agent).',
    '',
    '| Dimension | Points |',
    '|---|---|',
    ...report.dimensions.map((d) => `| ${d.dimension} | ${d.points.toFixed(1)} / ${d.maxPoints} |`),
    '',
    '### Prioritised recommendations',
    ...(failing.length ? failing.slice(0, 8).map((c, i) => `${i + 1}. **${c.title}** (${c.tier}, ${atStake(c)} pts) — ${c.recommendation} _Evidence: ${c.evidence}_`) : ['Nothing to fix among weighted checks.']),
    '',
    '### Informational (zero weight; tier D/E or descriptive)',
    ...report.checks.filter((c) => c.dimension === 'informational').map((c) => `- ${c.title}: ${c.evidence}`),
    '',
    `Evidence tiers: A-conditional = shown in a controlled in-context experiment only; B = official engine guidance; C = observational; D = hypothesis; E = folklore. Weights are a documented product choice (docs/GEO_METHODOLOGY.md §6).`,
  ];
  return lines.join('\n');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const { positionals } = parseFlags(process.argv.slice(2));
  if (!positionals[0]) { process.stderr.write('usage: readiness-digest.mjs <report.json>\n'); process.exit(2); }
  process.stdout.write(digest(JSON.parse(readFileSync(positionals[0], 'utf8'))) + '\n');
}
