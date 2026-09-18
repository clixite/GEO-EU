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
const NEGATION = /\b(not|no|never|none|without|neither|nor|cannot|isn't|aren't|doesn't|don't|won't|wasn't|weren't)\b/gi;
// Deliberately matches the sentence-initial word too: entity swaps are naturally written as the
// claim's subject ("Contoso Payments reconciles…" for evidence about Northwind Bank), so excluding
// the first word would blind the check to exactly the common case. The STOP-word filter below (not
// this regex) is what keeps ordinary sentence-initial capitals ("The", "Every") from being treated
// as entities.
const PROPER_NOUN = /\b\p{Lu}[\p{L}\p{N}&'’-]+\b/gu;
/** A figure and the unit or noun that follows it ("2.3 million", "14 countries", "90 days", "per day"). */
const FIGURE_UNIT = /\d[\d.,]*\s*(%|percent|[A-Za-z]{2,})/g;
const PER_UNIT = /\bper\s+([a-z]+)/gi;

function negations(text: string): Set<string> {
  return new Set((text.match(NEGATION) ?? []).map((n) => n.toLowerCase()));
}

/** Best-matching evidence sentence for a claim (by content-word overlap). */
function bestSentence(claim: string, evidenceText: string): string {
  const c = contentWords(claim);
  let best = evidenceText;
  let bestScore = -1;
  for (const s of splitSentences(evidenceText)) {
    const e = contentWords(s.text);
    let inter = 0;
    for (const w of c) if (e.has(w)) inter += 1;
    if (inter > bestScore) { bestScore = inter; best = s.text; }
  }
  return best;
}

function supports(claim: string, evidenceText: string): { ok: boolean; overlap: number; missingFigures: string[]; missingQualifiers: string[]; missingEntities: string[]; missingUnits: string[]; negationMismatch: boolean } {
  const clean = claim.replace(MARKER, '');
  const c = contentWords(clean);
  const e = contentWords(evidenceText);
  let inter = 0;
  for (const w of c) if (e.has(w)) inter += 1;
  const overlap = c.size ? inter / c.size : 0;
  const evFigures = new Set(figuresIn(evidenceText).map(normaliseFigure));
  const missingFigures = figuresIn(clean).map(normaliseFigure).filter((f) => !evFigures.has(f));
  const lowerEvidence = evidenceText.toLowerCase();
  // Superlatives and promises must literally appear in the evidence: "largest" is a claim, not a paraphrase.
  const missingQualifiers = [...new Set((clean.match(QUALIFIER) ?? []).map((q) => q.toLowerCase()))].filter((q) => !lowerEvidence.includes(q));
  // Proper nouns (who/what the claim is about) must appear in the evidence: "Acme Bank reconciles…" is not supported by a Northwind passage.
  const missingEntities = [...new Set((clean.match(PROPER_NOUN) ?? []).map((w) => w.toLowerCase()))].filter((w) => !STOP.has(w) && !lowerEvidence.includes(w));
  // Units and periods attached to figures must match: "2.3 million per week" is not "2.3 million per day".
  const evUnits = new Set([...(evidenceText.match(FIGURE_UNIT) ?? []).map((m) => m.replace(/^[\d.,\s]+/, '').toLowerCase()), ...(evidenceText.match(PER_UNIT) ?? []).map((m) => m.toLowerCase())]);
  const missingUnits = [...new Set([...(clean.match(FIGURE_UNIT) ?? []).map((m) => m.replace(/^[\d.,\s]+/, '').toLowerCase()), ...(clean.match(PER_UNIT) ?? []).map((m) => m.toLowerCase())])].filter((u) => !evUnits.has(u));
  // Negation must agree with the best-matching evidence sentence.
  const claimNeg = negations(clean);
  const evNeg = negations(bestSentence(clean, evidenceText));
  const negationMismatch = claimNeg.size !== evNeg.size || [...claimNeg].some((n) => !evNeg.has(n));
  return { ok: overlap >= 0.3 && missingFigures.length === 0 && missingQualifiers.length === 0 && missingEntities.length === 0 && missingUnits.length === 0 && !negationMismatch, overlap, missingFigures, missingQualifiers, missingEntities, missingUnits, negationMismatch };
}

export function verifyDraft(draft: string, evidence: readonly EvidenceItem[]): VerificationReport {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const placeholders = draft.match(PLACEHOLDER) ?? [];
  // Headings are verified like sentences (a fabricated figure in a heading is still a claim);
  // the H1 title line is exempt because it names the piece rather than asserting a fact.
  const body = draft.replace(PLACEHOLDER, '').replace(/^#\s[^\n]*$/m, '').replace(/^#{2,6}\s+/gm, '');
  const claims: ClaimVerification[] = [];
  const cited = new Set<string>();
  const superlatives: string[] = [];
  for (const s of splitSentences(body)) {
    const markers = [...s.text.matchAll(MARKER)].map((m) => `E${m[1]}`);
    for (const m of markers) cited.add(m);
    const clean = s.text.replace(MARKER, '').trim();
    // Short sentences with figures or proper nouns are claims too ("Founded 1998.").
    const found = extractClaims(clean, { minWords: /\d|\p{Lu}/u.test(clean.slice(1)) ? 2 : 4 });
    if (!found.length) continue;
    const kind = found[0]?.kind ?? 'fact';
    const candidates = markers.length ? markers.map((m) => byId.get(m)).filter((e): e is EvidenceItem => !!e) : evidence;
    const supportedBy: string[] = [];
    let reason = '';
    let bestOverlap = 0;
    let missing: string[] = [];
    let missingQualifiers: string[] = [];
    let missingEntities: string[] = [];
    let missingUnits: string[] = [];
    let negationMismatch = false;
    for (const e of candidates) {
      const r = supports(clean, e.text);
      bestOverlap = Math.max(bestOverlap, r.overlap);
      if (r.ok) supportedBy.push(e.id);
      else if (markers.includes(e.id)) {
        if (r.missingFigures.length) missing = r.missingFigures;
        if (r.missingQualifiers.length) missingQualifiers = r.missingQualifiers;
        if (r.missingEntities.length) missingEntities = r.missingEntities;
        if (r.missingUnits.length) missingUnits = r.missingUnits;
        if (r.negationMismatch) negationMismatch = true;
      }
    }
    // Uncited sentences need stronger overlap to count as supported (auto-link is conservative).
    const supported = markers.length ? supportedBy.length > 0 : supportedBy.some((id) => supports(clean, byId.get(id)?.text ?? '').overlap >= 0.45);
    if (!supported) {
      reason = markers.length === 0
        ? 'no evidence cited and no passage matches closely'
        : missing.length
          ? `cited evidence does not contain figure(s): ${missing.join(', ')}`
          : missingEntities.length
            ? `cited evidence does not mention: ${missingEntities.join(', ')}`
            : missingUnits.length
              ? `cited evidence does not state the unit(s)/period(s): ${missingUnits.join(', ')}`
              : negationMismatch
                ? 'negation differs from the cited evidence'
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
