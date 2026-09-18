import type { HeadingNode } from './html.ts';

/**
 * Heading-aware chunking. Each chunk carries the heading path it sits under so
 * retrieval can show "where" a passage comes from and so claims keep context.
 * Sentence boundaries are respected where possible; overlap preserves continuity.
 */
export interface Chunk {
  ordinal: number;
  headingPath: string;
  text: string;
  charStart: number;
  charEnd: number;
  tokenEstimate: number;
}

export interface ChunkOptions {
  targetChars?: number;
  overlapChars?: number;
  minChars?: number;
}

const SENTENCE_END = /(?<=[.!?…])\s+(?=[A-Z\p{Lu}0-9"“(])/u;

function headingPathAt(offset: number, headings: readonly HeadingNode[]): string {
  const path: string[] = [];
  let lastLevel = 0;
  for (const h of headings) {
    if (h.offset > offset) break;
    while (path.length && lastLevel >= h.level) { path.pop(); lastLevel -= 1; }
    path.push(h.text);
    lastLevel = h.level;
  }
  return path.join(' › ');
}

export function chunkText(text: string, headings: readonly HeadingNode[] = [], options: ChunkOptions = {}): Chunk[] {
  const target = options.targetChars ?? 1200;
  const overlap = options.overlapChars ?? 150;
  const min = options.minChars ?? 200;
  const chunks: Chunk[] = [];
  if (!text.trim()) return chunks;

  // Split into sentence-ish units with their offsets.
  const units: { start: number; end: number }[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let cursor = 0;
  for (const p of paragraphs) {
    const pStart = text.indexOf(p, cursor);
    const sentences = p.split(SENTENCE_END);
    let sCursor = pStart;
    for (const s of sentences) {
      const sStart = text.indexOf(s, sCursor);
      if (sStart === -1 || !s.trim()) continue;
      units.push({ start: sStart, end: sStart + s.length });
      sCursor = sStart + s.length;
    }
    cursor = pStart + p.length;
  }

  let i = 0;
  let ordinal = 0;
  while (i < units.length) {
    const start = (units[i] as { start: number }).start;
    let end = start;
    let j = i;
    while (j < units.length && (units[j] as { end: number }).end - start <= target) {
      end = (units[j] as { end: number }).end;
      j += 1;
    }
    if (j === i) { // single unit longer than target: hard split
      end = Math.min((units[i] as { end: number }).end, start + target);
      j = i + 1;
    }
    const body = text.slice(start, end).trim();
    if (body.length >= min || chunks.length === 0 || j >= units.length) {
      chunks.push({ ordinal: ordinal++, headingPath: headingPathAt(start, headings), text: body, charStart: start, charEnd: end, tokenEstimate: Math.ceil(body.length / 4) });
    } else if (chunks.length) {
      const prev = chunks[chunks.length - 1] as Chunk;
      prev.text = text.slice(prev.charStart, end).trim();
      prev.charEnd = end;
      prev.tokenEstimate = Math.ceil(prev.text.length / 4);
    }
    // Start the next chunk at the first unit inside the overlap window, but always progress.
    let k = overlap > 0 && j - 1 > i ? j - 1 : j;
    while (k - 1 > i && (units[k - 1] as { start: number }).start >= end - overlap) k -= 1;
    i = Math.max(i + 1, k);
  }
  return chunks;
}
