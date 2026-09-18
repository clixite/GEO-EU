/**
 * Deterministic entity extraction and resolution.
 *
 * Extracts organisation, product, person-like and place-like names from text using
 * capitalisation patterns, legal-form suffixes and known context words, then
 * resolves surface forms to canonical entities (case-, punctuation- and
 * legal-suffix-insensitive). It is intentionally conservative: precision over
 * recall, because entity consistency checks feed governance decisions.
 */

export type EntityKind = 'organisation' | 'product' | 'person' | 'place' | 'other';

export interface EntityMention {
  surface: string;
  canonical: string;
  kind: EntityKind;
  charStart: number;
  charEnd: number;
  confidence: number;
}

const LEGAL_SUFFIX = /\b(SRL|SA|SPRL|BV|NV|GmbH|AG|Ltd\.?|Limited|Inc\.?|LLC|S\.A\.|S\.R\.L\.|SAS|SARL|Oy|AB|ApS|A\/S|plc|PLC|SE)\b\.?/g;
const STOP = new Set(['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'It', 'We', 'You', 'They', 'He', 'She', 'I', 'Our', 'Your', 'Their', 'In', 'On', 'At', 'For', 'With', 'From', 'By', 'To', 'Of', 'And', 'Or', 'But', 'If', 'When', 'How', 'What', 'Why', 'Where', 'Who', 'Which', 'As', 'Is', 'Are', 'Was', 'Were', 'Be', 'Has', 'Have', 'Had', 'Do', 'Does', 'Did', 'Not', 'No', 'Yes', 'All', 'Any', 'Some', 'Every', 'Each', 'Many', 'Most', 'More', 'Other', 'Such', 'Also', 'However', 'Therefore', 'Because', 'Although', 'While', 'After', 'Before', 'During', 'Since', 'Until', 'Here', 'There', 'Then', 'Now', 'Today', 'Yesterday', 'Tomorrow', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Article', 'Section', 'Chapter', 'Figure', 'Table', 'Step', 'Note', 'Example', 'Summary', 'Overview', 'Introduction', 'Conclusion', 'FAQ', 'Customers', 'Contact']);
const PLACE_HINT = /\b(Brussels|Belgium|Paris|France|Berlin|Germany|Amsterdam|Netherlands|Luxembourg|Madrid|Spain|Rome|Italy|Vienna|Austria|Dublin|Ireland|Lisbon|Portugal|Warsaw|Poland|Prague|Stockholm|Sweden|Copenhagen|Denmark|Helsinki|Finland|Europe|European Union|EU|EEA|United Kingdom|London|Switzerland|Zurich|Geneva|Benelux)\b/;
const PERSON_TITLE = /\b(Mr|Mrs|Ms|Dr|Prof|Professor|CEO|CTO|CFO|COO|Director|Founder|Minister)\b\.?\s+$/;
const TITLE = String.raw`(?:(?:Mr|Mrs|Ms|Dr|Prof|Professor)\.?\s+)?`;
const TOKEN = String.raw`\p{Lu}[\p{L}\p{N}&'’-]*`;
const CONNECTOR = String.raw`(?:of|de|du|des|van|von|der|and|&|for|the)`;
const SUFFIX = String.raw`(?:\s+(?:SRL|SA|SPRL|BV|NV|GmbH|AG|Ltd|Limited|Inc|LLC|SAS|SARL|plc|PLC|SE)\.?)?`;
const MENTION_RE = new RegExp(String.raw`(?<![\p{L}\p{N}])(${TITLE}${TOKEN}(?:\s+(?:${CONNECTOR}\s+)?${TOKEN})*${SUFFIX})`, 'gu');
const TITLE_WORD = /^(Mr|Mrs|Ms|Dr|Prof|Professor)\.?$/;
const ORG_WORD = /\b(Group|Holdings|Bank|Insurance|Assurances|University|Hospital|Agency|Authority|Commission|Ministry|Council|Association|Federation|Institute|Foundation)\b/i;

export function canonicalName(surface: string): string {
  return surface
    .replace(LEGAL_SUFFIX, '')
    .replace(/[®™©]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasLegalSuffix(surface: string): boolean {
  return /\b(SRL|SA|SPRL|BV|NV|GmbH|AG|Ltd\.?|Limited|Inc\.?|LLC|SAS|SARL|Oy|AB|ApS|plc|PLC|SE)\b\.?$/.test(surface);
}

function classify(surface: string, before: string, after: string): { kind: EntityKind; confidence: number } {
  if (hasLegalSuffix(surface) || ORG_WORD.test(surface)) return { kind: 'organisation', confidence: 0.9 };
  if (PLACE_HINT.test(surface)) return { kind: 'place', confidence: 0.85 };
  if (PERSON_TITLE.test(before)) return { kind: 'person', confidence: 0.8 };
  if (/\b(platform|software|product|service|suite|app|application|tool|solution|version|v\d)\b/i.test(after.slice(0, 40)) || /\b(platform|software|product|service|suite|app|application|tool|solution)\b/i.test(surface)) return { kind: 'product', confidence: 0.7 };
  if (/\b(company|organisation|organization|firm|provider|vendor|startup|scale-up|team)\b/i.test(after.slice(0, 40)) || /\b(at|by|from|with)\s+$/.test(before)) return { kind: 'organisation', confidence: 0.6 };
  // Multi-word proper names of unknown kind are kept (needed for DSAR lookups); single words are weak.
  return { kind: 'other', confidence: surface.includes(' ') ? 0.55 : 0.45 };
}

export function extractEntities(text: string): EntityMention[] {
  const mentions: EntityMention[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    let surface = (m[1] ?? '').trim().replace(/[.,;:]+$/, '');
    if (!surface) continue;
    const words = surface.split(/\s+/);
    let forcedKind: EntityKind | null = null;
    if (words.length > 1 && TITLE_WORD.test(words[0] as string)) { words.shift(); forcedKind = 'person'; }
    while (words.length && (STOP.has(words[0] as string) || /^(of|de|du|des|van|von|der|and|&|for|the)$/i.test(words[0] as string))) words.shift();
    if (!words.length) continue;
    surface = words.join(' ');
    if (words.length === 1 && (surface.length < 3 || STOP.has(surface))) continue;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const isSentenceStart = /(^|[.!?…]\s+)$/.test(before) || m.index === 0;
    if (words.length === 1 && isSentenceStart && !PLACE_HINT.test(surface)) continue;
    if (words.length === 1 && !/^[A-Z][a-z]+[A-Z]|^[A-Z]{2,}|^[A-Z][a-z]{3,}$/.test(surface) && !PLACE_HINT.test(surface)) continue;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
    const classified = classify(surface, before, after);
    const kind = forcedKind ?? classified.kind;
    const confidence = forcedKind ? 0.85 : classified.confidence;
    const start = m.index + (m[1] ?? '').indexOf(surface);
    mentions.push({ surface, canonical: canonicalName(surface), kind, charStart: start, charEnd: start + surface.length, confidence });
  }
  return dedupeAdjacent(mentions);
}

function dedupeAdjacent(mentions: EntityMention[]): EntityMention[] {
  const out: EntityMention[] = [];
  for (const m of mentions) {
    const last = out[out.length - 1];
    if (last && last.charEnd >= m.charStart && last.canonical === m.canonical) continue;
    out.push(m);
  }
  return out;
}

export interface ResolvedEntity {
  canonical: string;
  kind: EntityKind;
  surfaces: string[];
  mentions: number;
  confidence: number;
}

/** Merge mentions into canonical entities, preferring the most specific kind seen. */
export function resolveEntities(mentions: readonly EntityMention[], minConfidence = 0.5): ResolvedEntity[] {
  const byKey = new Map<string, ResolvedEntity>();
  const kindRank: Record<EntityKind, number> = { organisation: 4, product: 3, person: 3, place: 2, other: 0 };
  for (const m of mentions) {
    const existing = byKey.get(m.canonical);
    if (!existing) {
      byKey.set(m.canonical, { canonical: m.canonical, kind: m.kind, surfaces: [m.surface], mentions: 1, confidence: m.confidence });
      continue;
    }
    existing.mentions += 1;
    if (!existing.surfaces.includes(m.surface)) existing.surfaces.push(m.surface);
    if (kindRank[m.kind] > kindRank[existing.kind]) existing.kind = m.kind;
    existing.confidence = Math.min(1, Math.max(existing.confidence, m.confidence) + 0.05);
  }
  return [...byKey.values()].filter((e) => e.confidence >= minConfidence).sort((a, b) => b.mentions - a.mentions);
}

/** Inconsistent spellings of the same entity across a corpus (e.g. "Clixite SRL" vs "Clixite Srl" vs "CLIXITE"). */
export function entityInconsistencies(entities: readonly ResolvedEntity[]): { canonical: string; variants: string[] }[] {
  return entities.filter((e) => e.surfaces.length > 1).map((e) => ({ canonical: e.canonical, variants: e.surfaces }));
}
