import type { ChatMessage } from '../providers/types.ts';
import type { RetrievalHit } from '../retrieval/hybrid.ts';
import { extractClaims, splitSentences, type ClaimKind } from '../knowledge/claims.ts';

/**
 * Evidence-grounded drafting and verification.
 *
 * Generation receives numbered evidence passages and must mark every factual
 * sentence with the evidence it relies on ([E1], [E2]…) or an explicit
 * [NEEDS EVIDENCE: …] placeholder. Verification is deterministic: every material
 * claim in the draft is checked against the cited passages (content-word overlap
 * and, for numbers and years, exact figure presence). A claim that cites evidence
 * which does not contain its figures is treated as unsupported — that is the
 * fabricated-statistic case the publication gate exists to catch.
 */

export interface EvidenceItem {
  id: string;
  text: string;
  locator: string;
  title: string | null;
  headingPath: string;
  authorityLevel: string;
  modifiedAt: string | null;
}

export interface DraftBrief {
  title: string;
  audience: string;
  intent: string;
  language?: string;
  outline?: string[];
  tone?: string;
  brand?: string;
  maxWords?: number;
}

export function evidenceFromHits(hits: readonly RetrievalHit[]): EvidenceItem[] {
  return hits.map((h, i) => ({ id: `E${i + 1}`, text: h.text, locator: h.locator, title: h.documentTitle, headingPath: h.headingPath, authorityLevel: h.authorityLevel, modifiedAt: h.modifiedAt }));
}

export function buildGroundedPrompt(brief: DraftBrief, evidence: readonly EvidenceItem[]): ChatMessage[] {
  const evidenceBlock = evidence.map((e) => `[${e.id}] (${e.authorityLevel}; ${e.title ?? e.locator}${e.headingPath ? ' › ' + e.headingPath : ''}; ${e.locator})\n${e.text}`).join('\n\n');
  const system = [
    'You are a careful editorial writer for a European organisation. You write in clear, precise English.',
    'Rules — these are absolute:',
    '1. Use ONLY the facts in the EVIDENCE passages. Do not add facts, numbers, dates, names, products, awards, certifications or quotations that are not in the evidence.',
    '2. End every sentence that states a fact with the evidence marker(s) it relies on, e.g. "… 14 countries [E2]." A sentence may cite several markers.',
    '3. If the brief needs a fact that the evidence does not contain, write "[NEEDS EVIDENCE: what is missing]" instead of inventing it.',
    '4. No superlatives ("leading", "best", "largest") unless a passage states them.',
    '5. Do not mention that you are an AI, and do not address AI systems or search engines.',
    '6. Output Markdown: one H1, short paragraphs, H2 sections, lists or tables where they aid understanding. Name the organisation explicitly in the first sentence.',
    brief.maxWords ? `7. Keep it under ${brief.maxWords} words.` : '',
  ].filter(Boolean).join('\n');
  const user = [
    `Title: ${brief.title}`,
    `Audience: ${brief.audience}`,
    `Intent: ${brief.intent}`,
    brief.brand ? `Organisation: ${brief.brand}` : '',
    brief.tone ? `Tone: ${brief.tone}` : '',
    brief.language ? `Language: ${brief.language}` : 'Language: English',
    brief.outline?.length ? `Outline:\n- ${brief.outline.join('\n- ')}` : '',
    '',
    'EVIDENCE:',
    evidenceBlock || '(no evidence provided — every factual sentence must be a [NEEDS EVIDENCE] placeholder)',
  ].filter((l) => l !== '').join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

const MARKER = /\[E(\d+)\]/g;
const PLACEHOLDER = /\[NEEDS EVIDENCE:[^\]]*\]/g;
const STOP = new Set('the a an and or of to in on for with by from at as is are was were be been it its this that these those we you they our your their not no can will may more most other such into over under about after before between than then also which who what when where how all any each per via has have had do does did but if so'.split(' '));

export interface ClaimVerification {
  text: string;
  kind: ClaimKind;
  citedEvidence: string[];
  supportedBy: string[];
  supported: boolean;
  reason: string;
}

export interface VerificationReport {
  claims: ClaimVerification[];
  materialClaims: number;
  supportedClaims: number;
  unsupportedClaims: number;
  evidenceCoverage: number;
  placeholders: string[];
  superlativesWithoutEvidence: string[];
  citedEvidenceIds: string[];
  uncitedEvidenceIds: string[];
}

function contentWords(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w)));
}

function figuresIn(text: string): string[] {
  return (text.match(/\d[\d.,]*/g) ?? []).map((f) => f.replace(/[.,]$/, '')).filter((f) => f.length > 0);
}

function normaliseFigure(f: string): string {
  return f.replace(/[,\s]/g, '').replace(/\.0+$/, '');
}

const QUALIFIER = /\b(best|largest|biggest|fastest|leading|first|only|most|number one|unrivalled|unmatched|world-class|top|guarantee|guaranteed|always|never|100%)\b/gi;

function supports(claim: string, evidenceText: string): { ok: boolean; overlap: number; missingFigures: string[]; missingQualifiers: string[] } {
  const clean = claim.replace(MARKER, '');
  const c = contentWords(clean);
  const e = contentWords(evidenceText);
  let inter = 0;
  for (const w of c) if (e.has(w)) inter += 1;
  const overlap = c.size ? inter / c.size : 0;
  const evFigures = new Set(figuresIn(evidenceText).map(normaliseFigure));
  const missingFigures = figuresIn(clean).map(normaliseFigure).filter((f) => !evFigures.has(f));
  // Superlatives and promises must literally appear in the evidence: "largest" is a claim, not a paraphrase.
  const lowerEvidence = evidenceText.toLowerCase();
  const missingQualifiers = [...new Set((clean.match(QUALIFIER) ?? []).map((q) => q.toLowerCase()))].filter((q) => !lowerEvidence.includes(q));
  return { ok: overlap >= 0.3 && missingFigures.length === 0 && missingQualifiers.length === 0, overlap, missingFigures, missingQualifiers };
}

export function verifyDraft(draft: string, evidence: readonly EvidenceItem[]): VerificationReport {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const placeholders = draft.match(PLACEHOLDER) ?? [];
  const body = draft.replace(PLACEHOLDER, '').replace(/^#.*$/gm, '');
  const claims: ClaimVerification[] = [];
  const cited = new Set<string>();
  const superlatives: string[] = [];
  for (const s of splitSentences(body)) {
    const markers = [...s.text.matchAll(MARKER)].map((m) => `E${m[1]}`);
    for (const m of markers) cited.add(m);
    const clean = s.text.replace(MARKER, '').trim();
    const found = extractClaims(clean, { minWords: 4 });
    if (!found.length) continue;
    const kind = found[0]?.kind ?? 'fact';
    const candidates = markers.length ? markers.map((m) => byId.get(m)).filter((e): e is EvidenceItem => !!e) : evidence;
    const supportedBy: string[] = [];
    let reason = '';
    let bestOverlap = 0;
    let missing: string[] = [];
    let missingQualifiers: string[] = [];
    for (const e of candidates) {
      const r = supports(clean, e.text);
      bestOverlap = Math.max(bestOverlap, r.overlap);
      if (r.ok) supportedBy.push(e.id);
      else if (markers.includes(e.id)) {
        if (r.missingFigures.length) missing = r.missingFigures;
        if (r.missingQualifiers.length) missingQualifiers = r.missingQualifiers;
      }
    }
    // Uncited sentences need stronger overlap to count as supported (auto-link is conservative).
    const supported = markers.length ? supportedBy.length > 0 : supportedBy.some((id) => supports(clean, byId.get(id)?.text ?? '').overlap >= 0.45);
    if (!supported) {
      reason = markers.length === 0
        ? 'no evidence cited and no passage matches closely'
        : missing.length
          ? `cited evidence does not contain figure(s): ${missing.join(', ')}`
          : missingQualifiers.length
            ? `cited evidence does not state the qualifier(s): ${missingQualifiers.join(', ')}`
            : `cited evidence does not support the statement (best overlap ${bestOverlap.toFixed(2)})`;
    }
    if (kind === 'superlative' && !supported) superlatives.push(clean);
    claims.push({ text: clean, kind, citedEvidence: markers, supportedBy: supported ? supportedBy : [], supported, reason });
  }
  const material = claims.length;
  const supportedCount = claims.filter((c) => c.supported).length;
  return {
    claims,
    materialClaims: material,
    supportedClaims: supportedCount,
    unsupportedClaims: material - supportedCount,
    evidenceCoverage: material ? supportedCount / material : 1,
    placeholders,
    superlativesWithoutEvidence: superlatives,
    citedEvidenceIds: [...cited].sort(),
    uncitedEvidenceIds: evidence.map((e) => e.id).filter((id) => !cited.has(id)),
  };
}

/** Replace [E#] markers by footnote references and append a sources section. */
export function renderWithSources(draft: string, evidence: readonly EvidenceItem[]): string {
  const used = new Map<string, number>();
  let n = 0;
  const body = draft.replace(MARKER, (_m, num: string) => {
    const id = `E${num}`;
    if (!used.has(id)) used.set(id, ++n);
    return `[^${used.get(id)}]`;
  });
  if (!used.size) return body;
  const notes = [...used.entries()].map(([id, i]) => {
    const e = evidence.find((x) => x.id === id);
    return e ? `[^${i}]: ${e.title ?? e.locator}${e.headingPath ? ' — ' + e.headingPath : ''} (${e.locator})` : `[^${i}]: ${id}`;
  });
  return `${body}\n\n## Sources\n\n${notes.join('\n')}`;
}

export function stripMarkers(draft: string): string {
  return draft.replace(MARKER, '').replace(/[ \t]+([.,;:])/g, '$1').replace(/[ \t]{2,}/g, ' ');
}
