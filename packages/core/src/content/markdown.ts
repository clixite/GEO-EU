/**
 * Minimal, safe Markdown → HTML renderer for publication artefacts.
 * Supports headings, paragraphs, ordered/unordered lists, blockquotes, links,
 * emphasis and inline code. All text is HTML-escaped; only http(s)/mailto links
 * are allowed. No raw HTML passthrough (untrusted model output never becomes markup).
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const safe = /^(https?:\/\/|mailto:|\/)/i.test(href) ? href : '#';
    const external = /^https?:\/\//i.test(safe);
    return `<a href="${escapeHtml(safe)}"${external ? ' rel="noopener"' : ''}>${label}</a>`;
  });
  return out;
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];
  const flushPara = () => { if (para.length) { html.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { html.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { html.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`); quote = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
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
  return html.join('\n');
}
