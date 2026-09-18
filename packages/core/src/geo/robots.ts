/**
 * robots.txt parsing and per-agent evaluation following the Robots Exclusion
 * Protocol (RFC 9309): group selection by most specific user-agent, longest-match
 * rule precedence, `*` and `$` wildcards, allow wins on equal length.
 *
 * The AI agent catalogue records what each documented crawler is for, so the
 * readiness report can say "blocked for ChatGPT search" instead of a generic
 * "robots issue". Purposes: search (indexing for answer engines), fetch
 * (user-initiated retrieval, may ignore robots.txt), training (model training).
 */

export interface AiAgent {
  token: string;
  engine: string;
  purpose: 'search' | 'fetch' | 'training';
  honoursRobots: boolean;
  note: string;
}

export const AI_AGENTS: readonly AiAgent[] = [
  { token: 'Googlebot', engine: 'Google AI Overviews / AI Mode', purpose: 'search', honoursRobots: true, note: 'AI Overviews and AI Mode use the regular Google index.' },
  { token: 'Google-Extended', engine: 'Gemini app / Vertex grounding', purpose: 'training', honoursRobots: true, note: 'Does not affect Google Search or AI Overviews.' },
  { token: 'OAI-SearchBot', engine: 'ChatGPT search', purpose: 'search', honoursRobots: true, note: 'Opting out removes the site from ChatGPT search answers.' },
  { token: 'ChatGPT-User', engine: 'ChatGPT (user-initiated fetch)', purpose: 'fetch', honoursRobots: false, note: 'May fetch on a user\'s behalf regardless of robots.txt.' },
  { token: 'GPTBot', engine: 'OpenAI training', purpose: 'training', honoursRobots: true, note: 'Training crawler; no effect on search answers.' },
  { token: 'Claude-SearchBot', engine: 'Claude search', purpose: 'search', honoursRobots: true, note: 'Indexing for Claude search results.' },
  { token: 'Claude-User', engine: 'Claude (user-initiated fetch)', purpose: 'fetch', honoursRobots: true, note: 'Honours robots.txt.' },
  { token: 'ClaudeBot', engine: 'Anthropic training', purpose: 'training', honoursRobots: true, note: 'Training crawler.' },
  { token: 'PerplexityBot', engine: 'Perplexity', purpose: 'search', honoursRobots: true, note: 'Indexing for Perplexity answers.' },
  { token: 'Perplexity-User', engine: 'Perplexity (user-initiated fetch)', purpose: 'fetch', honoursRobots: false, note: 'Generally ignores robots.txt per Perplexity docs.' },
  { token: 'bingbot', engine: 'Bing / Copilot', purpose: 'search', honoursRobots: true, note: 'NOARCHIVE/NOCACHE control Copilot usage.' },
  { token: 'CCBot', engine: 'Common Crawl (training corpora)', purpose: 'training', honoursRobots: true, note: 'Feeds many training datasets.' },
];

interface Rule {
  allow: boolean;
  pattern: string;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

export interface RobotsDocument {
  groups: Group[];
  sitemaps: string[];
}

export function parseRobots(text: string): RobotsDocument {
  const doc: RobotsDocument = { groups: [], sitemaps: [] };
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        doc.groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === 'sitemap') {
      doc.sitemaps.push(value);
      continue;
    }
    if ((field === 'allow' || field === 'disallow') && current) {
      current.rules.push({ allow: field === 'allow', pattern: value });
    }
  }
  return doc;
}

function patternToRegex(pattern: string): RegExp {
  let re = '';
  for (const ch of pattern) {
    if (ch === '*') re += '.*';
    else if (ch === '$') re += '$';
    else re += ch.replace(/[.+?^{}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re);
}

function selectGroup(doc: RobotsDocument, agent: string): Group | undefined {
  const a = agent.toLowerCase();
  let best: { group: Group; len: number } | undefined;
  for (const g of doc.groups) {
    for (const token of g.agents) {
      if (token === '*') continue;
      if (a.startsWith(token) || token.startsWith(a) || a.includes(token)) {
        if (!best || token.length > best.len) best = { group: g, len: token.length };
      }
    }
  }
  if (best) return best.group;
  return doc.groups.find((g) => g.agents.includes('*'));
}

export function isAllowed(doc: RobotsDocument, agent: string, path: string): { allowed: boolean; rule: string | null; group: string | null } {
  const group = selectGroup(doc, agent);
  if (!group) return { allowed: true, rule: null, group: null };
  let winner: Rule | null = null;
  let winnerLen = -1;
  for (const r of group.rules) {
    if (r.pattern === '') {
      if (!r.allow && winnerLen < 0) { /* "Disallow:" empty means allow all */ }
      continue;
    }
    if (patternToRegex(r.pattern).test(path)) {
      const len = r.pattern.length;
      if (len > winnerLen || (len === winnerLen && r.allow && winner && !winner.allow)) {
        winner = r;
        winnerLen = len;
      }
    }
  }
  return { allowed: winner ? winner.allow : true, rule: winner ? `${winner.allow ? 'Allow' : 'Disallow'}: ${winner.pattern}` : null, group: group.agents.join(', ') };
}

export interface AgentAccess extends AiAgent {
  allowed: boolean;
  rule: string | null;
  group: string | null;
}

/** Evaluate all catalogued AI agents against a path. */
export function evaluateAiAccess(robotsTxt: string | null, path: string): AgentAccess[] {
  const doc = robotsTxt === null ? { groups: [], sitemaps: [] } : parseRobots(robotsTxt);
  return AI_AGENTS.map((a) => ({ ...a, ...isAllowed(doc, a.token, path) }));
}
