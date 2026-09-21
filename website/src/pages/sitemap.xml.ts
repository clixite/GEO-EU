import type { APIRoute } from 'astro';

const SITE = 'https://evidentia.clixite.eu';
const LASTMOD = '2026-09-18';
const pages = ['/', '/product', '/geo-aeo', '/ai-visibility', '/trusted-knowledge', '/governance', '/eu-readiness', '/security', '/architecture', '/installation', '/use-cases', '/why', '/faq', '/changelog', '/licence', '/privacy', '/legal', '/contact', '/docs', '/docs/getting-started', '/docs/cli', '/docs/skill', '/docs/policies', '/docs/geo-methodology', '/docs/eu-governance'];

export const GET: APIRoute = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${SITE}${p === '/' ? '' : p}</loc><lastmod>${LASTMOD}</lastmod></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
