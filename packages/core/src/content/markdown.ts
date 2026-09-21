/**
 * Minimal, safe Markdown → HTML renderer for publication artefacts.
 * Supports headings, paragraphs, ordered/unordered lists, blockquotes, links,
 * emphasis, inline code and footnotes (`[^n]` references, `[^n]: text`
 * definitions). All text is HTML-escaped exactly once; only http(s)/mailto/
 * root-relative links are allowed (protocol-relative `//host` is rejected).
 * No raw HTML passthrough: untrusted model output never becomes markup.
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeHref(href: string): string {
  if (/^\/\//.test(href)) return '#';
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(href)) return href;
  return '#';
}

/** Inline markup on already-raw text: links are parsed first so hrefs are escaped once. */
function inline(text: string): string {
  const parts: string[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)|\[\^([A-Za-z0-9_-]+)\]/g;
  let last = 0;
  for (const m of text.matchAll(linkRe)) {
    parts.push(inlineText(text.slice(last, m.index)));
    if (m[3] !== undefined) {
      parts.push(`<sup class="fnref" id="fnref-${escapeHtml(m[3])}"><a href="#fn-${escapeHtml(m[3])}" aria-label="Footnote ${escapeHtml(m[3])}">${escapeHtml(m[3])}</a></sup>`);
    } else {
      const href = safeHref(m[2] as string);
      const external = /^https?:\/\//i.test(href);
      parts.push(`<a href="${escapeHtml(href)}"${external ? ' rel="noopener"' : ''}>${inlineText(m[1] as string)}</a>`);
    }
    last = m.index + m[0].length;
  }
  parts.push(inlineText(text.slice(last)));
  return parts.join('');
}

function inlineText(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  return out;
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  const footnotes: { id: string; text: string }[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];
  const flushPara = () => { if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { html.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { html.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`); quote = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const fn = line.match(/^\[\^([A-Za-z0-9_-]+)\]:\s+(.*)$/);
    if (fn) { flushPara(); flushList(); flushQuote(); footnotes.push({ id: fn[1] as string, text: fn[2] as string }); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushPara(); flushList(); flushQuote(); html.push(`<h${(h[1] as string).length}>${inline(h[2] as string)}</h${(h[1] as string).length}>`); continue; }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara(); flushQuote();
      const type = ul ? 'ul' : 'ol';
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push(((ul ?? ol) as RegExpMatchArray)[1] as string);
      continue;
    }
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) { flushPara(); flushList(); quote.push(bq[1] as string); continue; }
    if (!line.trim()) { flushPara(); flushList(); flushQuote(); continue; }
    flushList(); flushQuote();
    para.push(line.trim());
  }
  flushPara(); flushList(); flushQuote();
  if (footnotes.length) {
    html.push(`<section class="footnotes" aria-label="Sources"><ol>${footnotes.map((f) => `<li id="fn-${escapeHtml(f.id)}">${inline(f.text)} <a href="#fnref-${escapeHtml(f.id)}" aria-label="Back to reference ${escapeHtml(f.id)}">↩</a></li>`).join('')}</ol></section>`);
  }
  return html.join('\n');
}
