/**
 * Dependency-free, tolerant HTML extraction for analysis and ingestion.
 *
 * This is deliberately not a browser: no scripts run, no network, bounded input.
 * It extracts what GEO analysis and knowledge ingestion need — metadata, JSON-LD,
 * heading outline, main text, links — from untrusted HTML without executing it.
 */

export interface HeadingNode {
  level: number;
  text: string;
  /** Character offset of the heading in the extracted main text. */
  offset: number;
}

export interface ExtractedPage {
  title: string | null;
  lang: string | null;
  canonical: string | null;
  metaDescription: string | null;
  robots: string | null;
  og: Record<string, string>;
  hreflang: { lang: string; href: string }[];
  jsonLd: unknown[];
  jsonLdErrors: number;
  headings: HeadingNode[];
  /** Visible text of the main content region, paragraphs separated by blank lines. */
  text: string;
  /** All visible text including nav/footer (used for boilerplate ratio). */
  fullText: string;
  links: { href: string; text: string; rel: string | null }[];
  images: { src: string; alt: string | null }[];
  wordCount: number;
  hasMain: boolean;
  hasArticle: boolean;
  landmarks: string[];
  tables: number;
  lists: number;
  dates: { published: string | null; modified: string | null };
  author: string | null;
  bytes: number;
}

const MAX_BYTES = 8 * 1024 * 1024;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const DROP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'object']);
const BOILERPLATE = new Set(['nav', 'header', 'footer', 'aside']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'table', 'tr', 'td', 'th', 'dd', 'dt', 'dl', 'figure', 'figcaption', 'br', 'hr', 'header', 'footer', 'nav', 'aside', 'summary', 'details']);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', trade: '™', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const ATTR_RE = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1]?.toLowerCase();
    if (!name) continue;
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

const normaliseWs = (s: string) => s.replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Removes `<!-- comments -->`, `<![CDATA[ … ]]>` sections and `<!DOCTYPE …>`
 * declarations in one linear pass (`String.prototype.indexOf`, no regex).
 *
 * The regex form previously used for these three constructs
 * (`<!--[\s\S]*?-->` etc.) is a textbook ReDoS shape: an unbounded "match
 * anything, then find this literal terminator" ahead of a mandatory close
 * token. On ingested third-party HTML — attacker-controlled by design, since
 * this product ingests arbitrary URLs — an input consisting of many
 * repetitions of a bare opener with no closer anywhere (e.g. "<!--" repeated)
 * makes the regex engine re-scan the remaining input at every repetition,
 * which is quadratic in input length (CodeQL js/polynomial-redos; the
 * original pattern took several seconds on inputs well under the 8MB size
 * cap below). Bounding the regex's repetition empirically turned out not to
 * be reliably safe either: measured timings for a given bound varied
 * non-trivially with total input size and with which V8 code path a
 * particular quantifier/class shape happened to hit, which is not something
 * to depend on for a security fix. `indexOf`-based scanning has no such
 * dependency — it is linear by construction, one substring search per
 * construct found, however many times the opener repeats without a closer.
 *
 * Malformed input (an opener with no matching closer anywhere in the rest of
 * the document) is treated as extending to the end of the document, which is
 * the safe, conservative reading — the alternative of falling back to
 * treating an unterminated "<!--" as ordinary text risks emitting whatever
 * was meant to stay hidden inside it.
 */
function stripCommentsAndDeclarations(html: string): string {
  // DOCTYPE's keyword is case-insensitive per the HTML5 spec (browsers treat
  // "<!doctype html>" — how virtually every real page writes it — identically
  // to "<!DOCTYPE html>"); comments and CDATA have no letters to case-fold, or
  // are case-sensitive by spec (CDATA), so only the DOCTYPE search needs a
  // lowercased haystack. `toLowerCase()` keeps positions aligned with `html`
  // for the ASCII markers searched here.
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  const n = html.length;
  while (i < n) {
    const c = html.indexOf('<!--', i);
    const d = html.indexOf('<![CDATA[', i);
    const t = lower.indexOf('<!doctype', i);
    let next = -1;
    let opener = '';
    let closer = '';
    for (const [pos, open, close] of [[c, '<!--', '-->'], [d, '<![CDATA[', ']]>'], [t, '<!doctype', '>']] as const) {
      if (pos !== -1 && (next === -1 || pos < next)) { next = pos; opener = open; closer = close; }
    }
    if (next === -1) { out += html.slice(i); break; }
    out += html.slice(i, next);
    const closeAt = html.indexOf(closer, next + opener.length);
    i = closeAt === -1 ? n : closeAt + closer.length;
  }
  return out;
}

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=/"'<>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`]+))?)*)\s*(\/?)>/g;

export function extractHtml(rawHtml: string): ExtractedPage {
  const bytes = Buffer.byteLength(rawHtml, 'utf8');
  const html = stripCommentsAndDeclarations(bytes > MAX_BYTES ? rawHtml.slice(0, MAX_BYTES) : rawHtml);

  const page: ExtractedPage = {
    title: null, lang: null, canonical: null, metaDescription: null, robots: null, og: {}, hreflang: [], jsonLd: [], jsonLdErrors: 0,
    headings: [], text: '', fullText: '', links: [], images: [], wordCount: 0, hasMain: false, hasArticle: false, landmarks: [], tables: 0, lists: 0,
    dates: { published: null, modified: null }, author: null, bytes,
  };

  let mainText = '';
  let fullText = '';
  let inMain = false;
  let dropDepth = 0;
  let boilerplateDepth = 0;
  let titleBuf: string | null = null;
  let headingBuf: { level: number; text: string; offset: number } | null = null;
  let linkBuf: { href: string; text: string; rel: string | null } | null = null;
  let lastIndex = 0;
  const landmarks = new Set<string>();
  const hiddenStack: string[] = [];
  const sawMainTag = /<main[\s>]/i.test(html) || /role\s*=\s*["']?main/i.test(html);

  // Incremental whitespace normalisation keeps recorded offsets valid in the final text.
  const append = (buf: string, text: string): string => {
    let t = text.replace(/\s+/g, ' ');
    if (buf === '' || buf.endsWith('\n') || buf.endsWith(' ')) t = t.replace(/^ /, '');
    return buf + t;
  };
  const lineBreak = (buf: string): string => {
    const trimmed = buf.replace(/ +$/, '');
    if (trimmed === '' || trimmed.endsWith('\n\n')) return trimmed;
    return trimmed + '\n';
  };
  const inMainRegion = () => boilerplateDepth === 0 && (!sawMainTag || inMain);
  const emitText = (raw: string) => {
    const text = decodeEntities(raw);
    if (dropDepth > 0) return;
    if (titleBuf !== null) titleBuf += text;
    if (headingBuf) headingBuf.text += text;
    if (linkBuf) linkBuf.text += text;
    if (!text.trim()) return;
    fullText = append(fullText, text);
    if (inMainRegion()) mainText = append(mainText, text);
  };
  const emitBreak = () => {
    fullText = lineBreak(fullText);
    if (inMainRegion()) mainText = lineBreak(mainText);
  };

  for (const m of html.matchAll(TAG_RE)) {
    if (m.index > lastIndex) emitText(html.slice(lastIndex, m.index));
    lastIndex = m.index + m[0].length;
    const full = m[0];
    const name = (m[1] ?? '').toLowerCase();
    const isClose = full.startsWith('</');
    const attrs = isClose ? {} : parseAttrs(m[2] ?? '');
    const selfClose = m[3] === '/' || VOID.has(name);

    if (!isClose) {
      if (name === 'html' && attrs['lang']) page.lang = attrs['lang'];
      if (name === 'meta') {
        const n = (attrs['name'] ?? attrs['property'] ?? '').toLowerCase();
        const c = attrs['content'] ?? '';
        if (n === 'description') page.metaDescription = c;
        else if (n === 'robots') page.robots = c;
        else if (n.startsWith('og:')) page.og[n] = c;
        else if (n === 'author') page.author ??= c;
        else if (n === 'article:published_time' || n === 'datepublished') page.dates.published ??= c;
        else if (n === 'article:modified_time' || n === 'datemodified') page.dates.modified ??= c;
      }
      if (name === 'link') {
        const rel = (attrs['rel'] ?? '').toLowerCase();
        if (rel === 'canonical' && attrs['href']) page.canonical = attrs['href'];
        if (rel === 'alternate' && attrs['hreflang'] && attrs['href']) page.hreflang.push({ lang: attrs['hreflang'], href: attrs['href'] });
      }
      if (name === 'time' && attrs['datetime']) {
        const prop = (attrs['itemprop'] ?? '').toLowerCase();
        if (prop === 'datemodified') page.dates.modified ??= attrs['datetime'];
        else page.dates.published ??= attrs['datetime'];
      }
      if (name === 'img' && attrs['src']) page.images.push({ src: attrs['src'], alt: attrs['alt'] ?? null });
      if (name === 'table') page.tables += 1;
      if (name === 'ul' || name === 'ol') page.lists += 1;
      if (name === 'main' || attrs['role'] === 'main') { page.hasMain = true; landmarks.add('main'); }
      if (name === 'article') { page.hasArticle = true; landmarks.add('article'); }
      if (name === 'nav' || attrs['role'] === 'navigation') landmarks.add('nav');
      if (name === 'header' || attrs['role'] === 'banner') landmarks.add('header');
      if (name === 'footer' || attrs['role'] === 'contentinfo') landmarks.add('footer');
      if (name === 'aside' || attrs['role'] === 'complementary') landmarks.add('aside');
      if (name === 'script' && (attrs['type'] ?? '').toLowerCase().replace(/\s/g, '') === 'application/ld+json') {
        const end = html.indexOf('</script', lastIndex);
        const body = end === -1 ? '' : html.slice(lastIndex, end);
        try {
          const parsed: unknown = JSON.parse(body.trim());
          if (Array.isArray(parsed)) page.jsonLd.push(...parsed);
          else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { '@graph'?: unknown[] })['@graph'])) page.jsonLd.push(...((parsed as { '@graph': unknown[] })['@graph']));
          else page.jsonLd.push(parsed);
        } catch {
          page.jsonLdErrors += 1;
        }
      }
    }

    // Elements hidden by attribute or inline style are dropped from extracted text so
    // CSS-hidden instructions or figures cannot become "evidence" (readiness still
    // sees them through the raw-HTML hygiene check).
    const hiddenByStyle = !isClose && (attrs['hidden'] !== undefined || /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(px|em|rem|%)?\s*(;|$)|opacity\s*:\s*0(?![.\d]))/i.test(attrs['style'] ?? ''));
    if (DROP.has(name) || hiddenByStyle) {
      if (!isClose && !selfClose) { dropDepth += 1; if (hiddenByStyle && !DROP.has(name)) hiddenStack.push(name); }
      else if (isClose) dropDepth = Math.max(0, dropDepth - 1);
      if (DROP.has(name)) continue;
    }
    if (isClose && hiddenStack.length && hiddenStack[hiddenStack.length - 1] === name) { hiddenStack.pop(); dropDepth = Math.max(0, dropDepth - 1); }
    if (BOILERPLATE.has(name) || (!isClose && ['navigation', 'banner', 'contentinfo', 'complementary'].includes(attrs['role'] ?? ''))) {
      if (!isClose) boilerplateDepth += 1;
      else boilerplateDepth = Math.max(0, boilerplateDepth - 1);
    }
    if (!isClose && (name === 'main' || attrs['role'] === 'main')) inMain = true;
    if (isClose && name === 'main') inMain = false;

    if (name === 'title') {
      if (!isClose) titleBuf = '';
      else { page.title = normaliseWs(titleBuf ?? '') || null; titleBuf = null; }
    }
    if (/^h[1-6]$/.test(name)) {
      if (!isClose) {
        if (BLOCK.has(name)) emitBreak();
        headingBuf = { level: Number(name[1]), text: '', offset: mainText.length };
      } else if (headingBuf) {
        const text = normaliseWs(headingBuf.text);
        if (text && dropDepth === 0 && boilerplateDepth === 0) page.headings.push({ level: headingBuf.level, text, offset: headingBuf.offset });
        headingBuf = null;
      }
    }
    if (name === 'a') {
      if (!isClose) linkBuf = { href: attrs['href'] ?? '', text: '', rel: attrs['rel'] ?? null };
      else if (linkBuf) { if (linkBuf.href) page.links.push({ ...linkBuf, text: normaliseWs(linkBuf.text) }); linkBuf = null; }
    }
    if (BLOCK.has(name)) emitBreak();
  }
  if (lastIndex < html.length) emitText(html.slice(lastIndex));

  page.text = mainText.replace(/\s+$/, '');
  page.fullText = fullText.replace(/\s+$/, '');
  page.wordCount = page.text ? page.text.split(/\s+/).filter(Boolean).length : 0;
  page.landmarks = [...landmarks];
  return page;
}

/** Plain-text paragraphs from Markdown or text sources (no HTML parsing needed). */
export function extractText(text: string): { text: string; headings: HeadingNode[] } {
  const headings: HeadingNode[] = [];
  const lines = text.split(/\r?\n/);
  let out = '';
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) headings.push({ level: (h[1] as string).length, text: (h[2] as string).trim(), offset: out.length });
    out += (h ? (h[2] as string) : line) + '\n';
  }
  return { text: normaliseWs(out), headings };
}
