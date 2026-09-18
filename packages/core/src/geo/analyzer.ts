import { extractHtml, type ExtractedPage } from '../knowledge/html.ts';
import { extractClaims, splitSentences } from '../knowledge/claims.ts';
import { evaluateAiAccess, type AgentAccess } from './robots.ts';
import { scanForInjection } from '../security/injection.ts';

/**
 * GEO readiness analysis (readiness-v1).
 *
 * Measures what a page controls and what answer engines document — never
 * "visibility", which is measured by the observatory. Every check carries an
 * evidence tier (A-conditional, B, C, D, E) and points; D/E items are reported at
 * zero weight so users see what was checked and why it does not count. Weights are a
 * product design choice, documented in docs/GEO_METHODOLOGY.md, versioned here.
 *
 * Dimensions and weights: Retrievability 30 · Extractable evidence 25 ·
 * Provenance & freshness 20 · Structure 10 · Content quality (judgement) 15 ·
 * Hygiene penalties up to -15 · Off-site context 0 (reported separately).
 */

export const READINESS_VERSION = 'readiness-v1';

export type Tier = 'A-conditional' | 'B' | 'C' | 'D' | 'E';
export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info' | 'na';
export type Dimension = 'retrievability' | 'evidence' | 'provenance' | 'structure' | 'hygiene' | 'quality' | 'informational';

export interface Check {
  id: string;
  dimension: Dimension;
  title: string;
  tier: Tier;
  status: CheckStatus;
  points: number;
  maxPoints: number;
  evidence: string;
  recommendation?: string;
  /** Section of docs/GEO_METHODOLOGY.md that justifies the check. */
  ref: string;
}

export interface DimensionScore {
  dimension: Dimension;
  weight: number;
  points: number;
  maxPoints: number;
}

export interface ReadinessReport {
  version: typeof READINESS_VERSION;
  url: string;
  generatedAt: string;
  /** 0–100 including judged quality when available, else equals deterministicScore. */
  score: number;
  /** 0–100 from deterministic checks only (85-point base rescaled), minus penalties. */
  deterministicScore: number;
  penalties: number;
  qualityAssessed: boolean;
  dimensions: DimensionScore[];
  checks: Check[];
  engineAccess: AgentAccess[];
  blockedSearchEngines: string[];
  page: { title: string | null; wordCount: number; lang: string | null; canonical: string | null; headings: number };
}

export interface AnalyzeInput {
  url: string;
  html: string;
  /** robots.txt body; null when fetched and absent; undefined when not available. */
  robotsTxt?: string | null;
  httpHeaders?: Record<string, string>;
  sitemapLastmod?: string | null;
  llmsTxtPresent?: boolean;
  now?: Date;
  brand?: { name: string; aliases?: string[] };
  /** Optional judged content-quality score (0..1) with rubric/judge labels. */
  quality?: { score: number; judge: string; rubric: string };
}

const WEIGHTS: Record<Exclude<Dimension, 'hygiene' | 'informational'>, number> = { retrievability: 30, evidence: 25, provenance: 20, structure: 10, quality: 15 };
const MAX_PENALTY = 15;
const STOPWORDS = new Set('the a an and or of to in on for with by from at as is are was were be been it its this that these those we you they our your their not no yes can will may more most other such into over under about after before between than then also which who what when where how all any each per via'.split(' '));

function check(partial: Omit<Check, 'points'> & { points?: number }): Check {
  const points = partial.points ?? (partial.status === 'pass' ? partial.maxPoints : partial.status === 'warn' ? partial.maxPoints / 2 : 0);
  return { ...partial, points };
}

function isoDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function jsonLdOfType(page: ExtractedPage, type: string): Record<string, unknown>[] {
  return page.jsonLd.filter((n): n is Record<string, unknown> => {
    if (!n || typeof n !== 'object') return false;
    const t = (n as { '@type'?: unknown })['@type'];
    return Array.isArray(t) ? t.includes(type) : t === type;
  });
}

function externalDomains(page: ExtractedPage, pageHost: string): string[] {
  const hosts = new Set<string>();
  for (const l of page.links) {
    try {
      const u = new URL(l.href, `https://${pageHost}/`);
      if (!/^https?:$/.test(u.protocol)) continue;
      const h = u.hostname.replace(/^www\./, '');
      if (h && h !== pageHost.replace(/^www\./, '')) hosts.add(h);
    } catch { /* ignore invalid href */ }
  }
  return [...hosts];
}

function topTermShare(text: string): { term: string; share: number } {
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  if (tokens.length < 50) return { term: '', share: 0 };
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  let best = { term: '', share: 0 };
  for (const [term, n] of counts) if (n / tokens.length > best.share) best = { term, share: n / tokens.length };
  return best;
}

export function analyzePage(input: AnalyzeInput): ReadinessReport {
  const now = input.now ?? new Date();
  const page = extractHtml(input.html);
  const url = new URL(input.url);
  const checks: Check[] = [];
  const paragraphs = page.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const firstHeadingOffset = page.headings.find((h) => h.level >= 2)?.offset ?? Infinity;
  const brandNames = [input.brand?.name, ...(input.brand?.aliases ?? []), page.og['og:site_name'], jsonLdOfType(page, 'Organization')[0]?.['name'] as string | undefined].filter((s): s is string => !!s);
  const h1 = page.headings.find((h) => h.level === 1)?.text ?? null;

  // ---------------- Retrievability (30) ----------------
  const access = evaluateAiAccess(input.robotsTxt ?? null, url.pathname + url.search);
  const searchAgents = access.filter((a) => a.purpose === 'search');
  const blockedSearch = searchAgents.filter((a) => !a.allowed);
  if (input.robotsTxt === undefined) {
    checks.push(check({ id: 'R1', dimension: 'retrievability', title: 'AI search crawlers allowed in robots.txt', tier: 'B', status: 'na', maxPoints: 10, evidence: 'robots.txt not provided; run with the site robots.txt to evaluate per-engine access.', ref: '§3B.1' }));
  } else {
    checks.push(check({
      id: 'R1', dimension: 'retrievability', title: 'AI search crawlers allowed in robots.txt', tier: 'B', maxPoints: 10,
      status: blockedSearch.length === 0 ? 'pass' : blockedSearch.length < searchAgents.length ? 'warn' : 'fail',
      evidence: blockedSearch.length ? `blocked: ${blockedSearch.map((a) => `${a.token} (${a.engine}; ${a.rule})`).join('; ')}` : `all ${searchAgents.length} documented search agents allowed`,
      ...(blockedSearch.length ? { recommendation: 'Allow the search-purpose agents you want to appear in (OAI-SearchBot, Claude-SearchBot, PerplexityBot, Googlebot, bingbot). Training crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended) can stay blocked without affecting answers.' } : {}),
      ref: '§3B.1',
    }));
  }
  const robotsMeta = `${page.robots ?? ''} ${input.httpHeaders?.['x-robots-tag'] ?? ''}`.toLowerCase();
  const noindex = /\bnoindex\b|\bnone\b/.test(robotsMeta);
  const snippetLimited = /\bnosnippet\b|max-snippet:\s*0|\bnoarchive\b|\bnocache\b/.test(robotsMeta);
  checks.push(check({
    id: 'R2', dimension: 'retrievability', title: 'No noindex / snippet restrictions', tier: 'B', maxPoints: 8,
    status: noindex ? 'fail' : snippetLimited ? 'warn' : 'pass',
    evidence: robotsMeta.trim() ? `robots directives: ${robotsMeta.trim()}` : 'no restrictive robots meta or X-Robots-Tag',
    ...(noindex ? { recommendation: 'Remove noindex; an engine cannot cite a page it may not index.' } : snippetLimited ? { recommendation: 'nosnippet / max-snippet:0 / noarchive prevent engines from quoting or (Copilot) using the page. Relax unless intentional.' } : {}),
    ref: '§3B.1',
  }));
  let canonicalStatus: CheckStatus = 'warn';
  let canonicalEvidence = 'no rel=canonical declared; the engine will choose one';
  if (page.canonical) {
    try {
      const c = new URL(page.canonical, input.url);
      if (c.hostname.replace(/^www\./, '') !== url.hostname.replace(/^www\./, '')) { canonicalStatus = 'fail'; canonicalEvidence = `canonical points to another host: ${c.hostname}`; }
      else if (!/^https?:/.test(page.canonical)) { canonicalStatus = 'warn'; canonicalEvidence = `canonical is relative (${page.canonical}); use an absolute URL`; }
      else { canonicalStatus = 'pass'; canonicalEvidence = `canonical ${c.toString()}`; }
    } catch { canonicalStatus = 'fail'; canonicalEvidence = `invalid canonical: ${page.canonical}`; }
  }
  checks.push(check({ id: 'R3', dimension: 'retrievability', title: 'Canonical URL declared and consistent', tier: 'B', maxPoints: 6, status: canonicalStatus, evidence: canonicalEvidence, ...(canonicalStatus !== 'pass' ? { recommendation: 'Declare one absolute, self-referencing rel=canonical per page.' } : {}), ref: '§3B.3' }));
  checks.push(check({
    id: 'R4', dimension: 'retrievability', title: 'Main content present in raw HTML', tier: 'B', maxPoints: 6,
    status: page.wordCount >= 150 && page.headings.length > 0 ? 'pass' : page.wordCount >= 50 ? 'warn' : 'fail',
    evidence: `${page.wordCount} words of main-content text in the raw HTML; ${page.headings.length} headings`,
    ...(page.wordCount < 150 ? { recommendation: 'Server-render the main content: crawlers that do not execute JavaScript see only the raw HTML.' } : {}),
    ref: '§3B.2',
  }));
  checks.push(check({ id: 'R5', dimension: 'informational', title: 'Sitemap lastmod', tier: 'B', maxPoints: 0, status: 'info', evidence: input.sitemapLastmod ? `sitemap lastmod ${input.sitemapLastmod}` : input.sitemapLastmod === null ? 'URL not found in sitemap' : 'sitemap not checked', ref: '§3B.14' }));

  // ---------------- Extractable evidence (25) ----------------
  const claims = extractClaims(page.text);
  const stats = claims.filter((c) => c.kind === 'statistic');
  const extDomains = externalDomains(page, url.hostname);
  const attributionRe = /\b(according to|source:|sources:|reported by|published by|data from|study by|survey by|per\s+[A-Z])/i;
  const attributedStats = stats.filter((s) => {
    const para = paragraphs.find((p) => p.includes(s.text.slice(0, 40)));
    const hasLink = page.links.some((l) => para?.includes(l.text) && l.text.length > 3 && extDomains.some((d) => l.href.includes(d)));
    return attributionRe.test(s.text) || attributionRe.test(para ?? '') || hasLink;
  });
  const statShare = stats.length ? attributedStats.length / stats.length : 0;
  checks.push(check({
    id: 'E1', dimension: 'evidence', title: 'Statistics with attribution', tier: 'A-conditional', maxPoints: 7,
    status: stats.length === 0 ? 'warn' : statShare >= 0.5 ? 'pass' : 'warn',
    points: stats.length === 0 ? 2 : statShare >= 0.5 ? 7 : 3.5,
    evidence: stats.length ? `${stats.length} quantitative statement(s), ${attributedStats.length} with a visible source or link` : 'no quantitative statements found',
    ...(stats.length === 0 ? { recommendation: 'Add concrete, sourced figures (dates, quantities, percentages) where the topic supports them.' } : statShare < 0.5 ? { recommendation: 'Attribute figures to a named source with a link or "according to …".' } : {}),
    ref: '§3A.2',
  }));
  checks.push(check({
    id: 'E2', dimension: 'evidence', title: 'Outbound references to external sources', tier: 'A-conditional', maxPoints: 6,
    status: extDomains.length >= 2 ? 'pass' : extDomains.length === 1 ? 'warn' : 'fail',
    evidence: extDomains.length ? `links to ${extDomains.length} external domain(s): ${extDomains.slice(0, 5).join(', ')}` : 'no outbound links to external sources in the main content',
    ...(extDomains.length < 2 ? { recommendation: 'Cite primary sources (regulators, standards bodies, official statistics) with links.' } : {}),
    ref: '§3A.1',
  }));
  const quotes = (input.html.match(/<(blockquote|q)\b/gi) ?? []).length + (page.text.match(/[“"][^”"]{60,}[”"]\s*[—–-]\s*[A-Z]/g) ?? []).length;
  checks.push(check({ id: 'E3', dimension: 'evidence', title: 'Attributed quotations', tier: 'A-conditional', maxPoints: 4, status: quotes >= 1 ? 'pass' : 'warn', evidence: quotes ? `${quotes} quotation element(s)` : 'no attributed quotations', ...(quotes ? {} : { recommendation: 'Where an expert view matters, quote a named person with role and organisation.' }), ref: '§3A.3' }));
  checks.push(check({ id: 'E4', dimension: 'evidence', title: 'Tables or lists for comparisons and procedures', tier: 'C', maxPoints: 4, status: page.tables >= 1 || page.lists >= 1 ? 'pass' : 'warn', evidence: `${page.tables} table(s), ${page.lists} list(s)`, ...(page.tables + page.lists ? {} : { recommendation: 'Present comparisons as tables and procedures as numbered lists where the intent warrants.' }), ref: '§3A.9' }));
  const firstPara = paragraphs.find((p) => p !== h1 && p.split(/\s+/).length >= 8) ?? '';
  const entityFirst = brandNames.some((b) => firstPara.toLowerCase().includes(b.toLowerCase())) || (h1 ? firstPara.toLowerCase().includes(h1.toLowerCase().split(/\s+/).slice(0, 2).join(' ')) : false);
  checks.push(check({ id: 'E5', dimension: 'evidence', title: 'Primary entity named in the first paragraph', tier: 'C', maxPoints: 2, status: entityFirst ? 'pass' : 'warn', evidence: entityFirst ? 'entity named at first mention' : 'first paragraph does not name the page entity/brand', ...(entityFirst ? {} : { recommendation: 'Name the organisation/product in the opening sentence rather than "we"/"it".' }), ref: '§3A.11' }));
  const introSentences = splitSentences(firstPara).length;
  const summaryFirst = firstPara.length > 0 && page.text.indexOf(firstPara) < firstHeadingOffset && introSentences <= 3 && firstPara.split(/\s+/).length >= 20;
  checks.push(check({ id: 'E6', dimension: 'evidence', title: 'Concise summary before the first subheading', tier: 'C', maxPoints: 2, status: summaryFirst ? 'pass' : 'warn', evidence: summaryFirst ? `${introSentences}-sentence summary paragraph before the first H2` : 'no short summary paragraph before the first H2', ...(summaryFirst ? {} : { recommendation: 'Open with a 1–3 sentence direct answer to the page question, then elaborate. (No fixed word count is supported by evidence.)' }), ref: '§3A.7' }));

  // ---------------- Provenance & freshness (20) ----------------
  const article = jsonLdOfType(page, 'Article')[0] ?? jsonLdOfType(page, 'NewsArticle')[0] ?? jsonLdOfType(page, 'BlogPosting')[0] ?? jsonLdOfType(page, 'WebPage')[0];
  const published = isoDate((article?.['datePublished'] as string | undefined) ?? page.dates.published);
  const modified = isoDate((article?.['dateModified'] as string | undefined) ?? page.dates.modified);
  const dateOrderOk = !(published && modified) || modified.getTime() >= published.getTime();
  checks.push(check({
    id: 'P1', dimension: 'provenance', title: 'Machine-readable published and modified dates', tier: 'B', maxPoints: 6,
    status: published && modified && dateOrderOk ? 'pass' : published || modified ? 'warn' : 'fail',
    evidence: `datePublished ${published?.toISOString().slice(0, 10) ?? 'missing'}, dateModified ${modified?.toISOString().slice(0, 10) ?? 'missing'}${dateOrderOk ? '' : ' (modified before published!)'}`,
    ...(published && modified && dateOrderOk ? {} : { recommendation: 'Publish one visible date and Article.datePublished/dateModified in ISO 8601, consistent with sitemap lastmod.' }),
    ref: '§3A.13',
  }));
  const ageDays = modified ? (now.getTime() - modified.getTime()) / 86_400_000 : published ? (now.getTime() - published.getTime()) / 86_400_000 : null;
  checks.push(check({
    id: 'P2', dimension: 'provenance', title: 'Content updated within the last year', tier: 'C', maxPoints: 4,
    status: ageDays === null ? 'fail' : ageDays <= 365 ? 'pass' : ageDays <= 730 ? 'warn' : 'fail',
    evidence: ageDays === null ? 'no date to assess freshness' : `last modified ${Math.round(ageDays)} days ago`,
    ...(ageDays !== null && ageDays <= 365 ? {} : { recommendation: 'Review and substantively update time-sensitive content; cosmetic date bumps are not rewarded.' }),
    ref: '§3A.13',
  }));
  const authorNode = article?.['author'];
  const authorName = authorNode && typeof authorNode === 'object' ? ((authorNode as { name?: unknown }).name as string | undefined) : typeof authorNode === 'string' ? authorNode : undefined;
  const author: string | null = authorName ?? page.author;
  checks.push(check({ id: 'P3', dimension: 'provenance', title: 'Named author / accountable byline', tier: 'B', maxPoints: 4, status: author ? 'pass' : 'warn', evidence: author ? `author: ${author}` : 'no author metadata or byline', ...(author ? {} : { recommendation: 'Add an accurate byline and Article.author; link to an author page. (Bylines are good practice, not a proven citation lever.)' }), ref: '§3A.14' }));
  const org = jsonLdOfType(page, 'Organization')[0];
  const sameAs = Array.isArray(org?.['sameAs']) ? (org['sameAs'] as unknown[]).length : org?.['sameAs'] ? 1 : 0;
  const orgStrong = !!org && typeof org['name'] === 'string' && typeof org['url'] === 'string' && sameAs >= 2;
  checks.push(check({ id: 'P4', dimension: 'provenance', title: 'Organization JSON-LD with sameAs profiles', tier: 'B', maxPoints: 4, status: orgStrong ? 'pass' : org ? 'warn' : 'fail', evidence: org ? `Organization "${String(org['name'] ?? '')}" with ${sameAs} sameAs link(s)` : 'no Organization JSON-LD', ...(orgStrong ? {} : { recommendation: 'Add Organization JSON-LD (name, url, logo, sameAs to ≥2 authoritative profiles) for entity disambiguation — not as a citation booster.' }), ref: '§3B.6' }));
  const headline = typeof article?.['headline'] === 'string' ? (article['headline'] as string) : null;
  const headlineOk = !headline || page.text.includes(headline) || (page.title ?? '').includes(headline);
  const orgNameOk = !org || typeof org['name'] !== 'string' || page.fullText.includes(org['name'] as string) || (page.title ?? '').includes(org['name'] as string);
  checks.push(check({ id: 'P5', dimension: 'provenance', title: 'Structured data parses and matches visible content', tier: 'B', maxPoints: 2, status: page.jsonLdErrors === 0 && headlineOk && orgNameOk ? 'pass' : 'warn', evidence: `${page.jsonLd.length} JSON-LD node(s), ${page.jsonLdErrors} parse error(s)${headlineOk ? '' : '; headline not visible on page'}${orgNameOk ? '' : '; organisation name not visible on page'}`, ...(page.jsonLdErrors === 0 && headlineOk && orgNameOk ? {} : { recommendation: 'Fix JSON-LD syntax and keep markup values identical to visible text.' }), ref: '§3B.6' }));

  // ---------------- Structure (10) ----------------
  const h1Count = page.headings.filter((h) => h.level === 1).length;
  checks.push(check({ id: 'S1', dimension: 'structure', title: 'Exactly one H1', tier: 'B', maxPoints: 3, status: h1Count === 1 ? 'pass' : h1Count === 0 ? 'fail' : 'warn', evidence: `${h1Count} H1 element(s)`, ...(h1Count === 1 ? {} : { recommendation: 'Use a single H1 that states the page topic.' }), ref: '§3B.4' }));
  let skipped = (page.headings[0]?.level ?? 1) > 1 ? 1 : 0;
  for (let i = 1; i < page.headings.length; i++) if ((page.headings[i]?.level ?? 0) - (page.headings[i - 1]?.level ?? 0) > 1) skipped += 1;
  checks.push(check({ id: 'S2', dimension: 'structure', title: 'No skipped heading levels', tier: 'B', maxPoints: 2, status: page.headings.length < 2 ? 'warn' : skipped === 0 ? 'pass' : 'warn', evidence: page.headings.length < 2 ? 'fewer than two headings' : `${skipped} skipped level(s)`, ref: '§3B.4' }));
  const landmarksOk = page.hasMain && page.landmarks.includes('nav');
  checks.push(check({ id: 'S3', dimension: 'structure', title: 'Semantic landmarks (main, nav, header, footer)', tier: 'B', maxPoints: 2, status: landmarksOk ? 'pass' : page.hasMain || page.hasArticle ? 'warn' : 'fail', evidence: `landmarks: ${page.landmarks.join(', ') || 'none'}`, ...(landmarksOk ? {} : { recommendation: 'Wrap primary content in <main>/<article> and navigation in <nav>; agents use the accessibility tree.' }), ref: '§3B.4' }));
  const missingAlt = page.images.filter((i) => i.alt === null).length;
  checks.push(check({ id: 'S4', dimension: 'structure', title: 'Images have alt text', tier: 'B', maxPoints: 1, status: page.images.length === 0 || missingAlt === 0 ? 'pass' : missingAlt < page.images.length ? 'warn' : 'fail', evidence: `${page.images.length} image(s), ${missingAlt} without alt`, ref: '§3B.4' }));
  checks.push(check({ id: 'S5', dimension: 'structure', title: 'Document language declared', tier: 'B', maxPoints: 1, status: page.lang ? 'pass' : 'warn', evidence: page.lang ? `lang="${page.lang}"` : 'no lang attribute', ref: '§3B.13' }));
  let hreflangStatus: CheckStatus = 'pass';
  let hreflangEvidence = 'no hreflang set (single-language page)';
  if (page.hreflang.length) {
    const absolute = page.hreflang.every((h) => /^https?:/.test(h.href));
    const hasSelf = page.hreflang.some((h) => { try { return new URL(h.href).pathname === url.pathname; } catch { return false; } });
    const hasDefault = page.hreflang.some((h) => h.lang.toLowerCase() === 'x-default');
    hreflangStatus = absolute && hasSelf && hasDefault ? 'pass' : 'warn';
    hreflangEvidence = `${page.hreflang.length} hreflang link(s); absolute=${absolute}, self=${hasSelf}, x-default=${hasDefault}`;
  }
  checks.push(check({ id: 'S6', dimension: 'structure', title: 'hreflang set is absolute, self-referencing and has x-default', tier: 'B', maxPoints: 1, status: hreflangStatus, evidence: hreflangEvidence, ref: '§3B.13' }));

  // ---------------- Hygiene (penalties) ----------------
  const tt = topTermShare(page.text);
  const stuffing = tt.share > 0.04 ? 'fail' : tt.share > 0.03 ? 'warn' : 'pass';
  checks.push(check({ id: 'H1', dimension: 'hygiene', title: 'No keyword stuffing', tier: 'A-conditional', maxPoints: 5, status: stuffing, points: stuffing === 'fail' ? -5 : stuffing === 'warn' ? -2 : 0, evidence: tt.term ? `top term "${tt.term}" = ${(tt.share * 100).toFixed(1)}% of content tokens` : 'not enough text to assess', ...(stuffing === 'pass' ? {} : { recommendation: 'Reduce repetition; engines and spam policies penalise artificially engineered language.' }), ref: '§3A.15' }));
  const hiddenCss = /(font-size\s*:\s*0(px|em|rem|%)?|opacity\s*:\s*0(?![.\d])|text-indent\s*:\s*-\d{4,}px|left\s*:\s*-\d{4,}px|visibility\s*:\s*hidden)[^>]*>[^<]{20,}/i.test(input.html);
  const injectionFindings = scanForInjection([page.fullText, page.images.map((i) => i.alt ?? '').join(' '), JSON.stringify(page.jsonLd)].join('\n'));
  const injectionText = injectionFindings.some((f) => f.severity === 'high');
  const hiddenStatus = injectionText ? 'fail' : hiddenCss ? 'warn' : 'pass';
  checks.push(check({ id: 'H2', dimension: 'hygiene', title: 'No hidden text or prompt-injection strings', tier: 'B', maxPoints: 6, status: hiddenStatus, points: hiddenStatus === 'fail' ? -6 : hiddenStatus === 'warn' ? -3 : 0, evidence: injectionText ? `instruction-like strings addressed to AI systems found (${injectionFindings.map((f) => f.id).join(', ')})` : hiddenCss ? 'CSS-hidden text pattern detected (verify it is an interactive component)' : 'none detected', ...(hiddenStatus === 'pass' ? {} : { recommendation: 'Remove text aimed at manipulating AI systems; it is treated as spam/attack by engines.' }), ref: '§3A.16' }));
  const thin = page.wordCount < 150;
  checks.push(check({ id: 'H3', dimension: 'hygiene', title: 'Not thin', tier: 'B', maxPoints: 2, status: thin ? 'fail' : 'pass', points: thin ? -2 : 0, evidence: `${page.wordCount} words`, ...(thin ? { recommendation: 'Pages under ~150 words rarely contain extractable evidence; expand or merge.' } : {}), ref: '§3A.10' }));
  const mismatch = !headlineOk || !orgNameOk;
  checks.push(check({ id: 'H4', dimension: 'hygiene', title: 'Structured data matches visible content', tier: 'B', maxPoints: 2, status: mismatch ? 'fail' : 'pass', points: mismatch ? -2 : 0, evidence: mismatch ? 'JSON-LD values not visible on page' : 'consistent', ref: '§3B.6' }));

  // ---------------- Informational (0 weight, D/E) ----------------
  const faq = jsonLdOfType(page, 'FAQPage').length > 0;
  const questionHeadings = page.headings.filter((h) => h.level >= 2 && (/\?$/.test(h.text) || /^(what|how|why|when|where|who|which|can|does|is|are)\b/i.test(h.text))).length;
  const hedges = (page.text.match(/\b(may|might|could|possibly|perhaps|it depends)\b/gi) ?? []).length;
  checks.push(check({ id: 'I1', dimension: 'informational', title: 'llms.txt present', tier: 'E', maxPoints: 0, status: 'info', evidence: input.llmsTxtPresent === undefined ? 'not checked' : input.llmsTxtPresent ? 'present (harmless; no engine documents using it)' : 'absent (no evidence it matters)', ref: '§3B.8' }));
  checks.push(check({ id: 'I2', dimension: 'informational', title: 'FAQPage markup', tier: 'E', maxPoints: 0, status: 'info', evidence: faq ? 'present — inert for rich results since 2026-05; visible Q&A content is what matters' : 'absent', ref: '§3B.9' }));
  checks.push(check({ id: 'I3', dimension: 'informational', title: 'Question-shaped headings', tier: 'D', maxPoints: 0, status: 'info', evidence: `${questionHeadings} of ${page.headings.length} headings are questions`, ref: '§3A.8' }));
  checks.push(check({ id: 'I4', dimension: 'informational', title: 'Word count', tier: 'B', maxPoints: 0, status: 'info', evidence: `${page.wordCount} words (no ideal length exists)`, ref: '§3A.10' }));
  checks.push(check({ id: 'I5', dimension: 'informational', title: 'Hedging rate', tier: 'D', maxPoints: 0, status: 'info', evidence: `${hedges} hedging expression(s) per ${page.wordCount} words`, ref: '§3A.4' }));

  // ---------------- Quality (judged, 15) ----------------
  if (input.quality) {
    const s = Math.max(0, Math.min(1, input.quality.score));
    checks.push(check({ id: 'Q1', dimension: 'quality', title: 'Content quality (judged)', tier: 'B', maxPoints: 15, status: s >= 0.7 ? 'pass' : s >= 0.4 ? 'warn' : 'fail', points: s * 15, evidence: `judge ${input.quality.judge}, rubric ${input.quality.rubric}, score ${s.toFixed(2)}`, ref: '§3A.12' }));
  } else {
    checks.push(check({ id: 'Q1', dimension: 'quality', title: 'Content quality (judged)', tier: 'B', maxPoints: 15, status: 'na', points: 0, evidence: 'not assessed (no judge configured); deterministic score shown', ref: '§3A.12' }));
  }

  // ---------------- Scoring ----------------
  const dims: DimensionScore[] = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).map((d) => {
    const cs = checks.filter((c) => c.dimension === d && c.status !== 'na');
    const max = cs.reduce((n, c) => n + c.maxPoints, 0);
    const pts = cs.reduce((n, c) => n + c.points, 0);
    return { dimension: d, weight: WEIGHTS[d], points: max ? (pts / max) * WEIGHTS[d] : 0, maxPoints: max ? WEIGHTS[d] : 0 };
  });
  const penalties = Math.min(MAX_PENALTY, -checks.filter((c) => c.dimension === 'hygiene').reduce((n, c) => n + c.points, 0)) || 0;
  const deterministicDims = dims.filter((d) => d.dimension !== 'quality');
  const detMax = deterministicDims.reduce((n, d) => n + d.maxPoints, 0) || 1;
  const detPts = deterministicDims.reduce((n, d) => n + d.points, 0);
  const deterministicScore = Math.max(0, Math.round((detPts / detMax) * 100 - penalties));
  const qualityAssessed = !!input.quality;
  const qualityDim = dims.find((d) => d.dimension === 'quality');
  const score = qualityAssessed && qualityDim ? Math.max(0, Math.round(detPts + qualityDim.points - penalties)) : deterministicScore;

  return {
    version: READINESS_VERSION,
    url: input.url,
    generatedAt: now.toISOString(),
    score: blockedSearch.length === searchAgents.length && input.robotsTxt !== undefined ? 0 : score,
    deterministicScore,
    penalties,
    qualityAssessed,
    dimensions: dims,
    checks,
    engineAccess: access,
    blockedSearchEngines: blockedSearch.map((a) => a.engine),
    page: { title: page.title, wordCount: page.wordCount, lang: page.lang, canonical: page.canonical, headings: page.headings.length },
  };
}

/** Prioritised, human-readable recommendations from a report (fails first, then warns, by points at stake). */
export function recommendations(report: ReadinessReport): { id: string; title: string; recommendation: string; atStake: number }[] {
  return report.checks
    .filter((c) => c.recommendation && (c.status === 'fail' || c.status === 'warn'))
    .map((c) => ({ id: c.id, title: c.title, recommendation: c.recommendation as string, atStake: c.dimension === 'hygiene' ? Math.abs(c.points) : c.maxPoints - c.points }))
    .sort((a, b) => b.atStake - a.atStake);
}
