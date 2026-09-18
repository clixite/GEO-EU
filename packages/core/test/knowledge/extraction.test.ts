import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, extractHtml, extractText } from '../../src/knowledge/html.ts';
import { chunkText } from '../../src/knowledge/chunker.ts';
import { extractClaims } from '../../src/knowledge/claims.ts';
import { entityInconsistencies, extractEntities, resolveEntities } from '../../src/knowledge/entities.ts';

const SAMPLE = `<!doctype html><html lang="en"><head><title>Payment Reconciliation &amp; Reporting | Northwind Bank</title>
<meta name="description" content="How Northwind Bank reconciles payments.">
<meta property="og:title" content="Payment Reconciliation"><meta name="robots" content="index,follow">
<link rel="canonical" href="https://www.northwind.example/reconciliation">
<link rel="alternate" hreflang="fr" href="https://www.northwind.example/fr/reconciliation">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Payment Reconciliation","datePublished":"2026-03-01","author":{"@type":"Person","name":"Anna Peeters"}}</script>
<script type="application/ld+json">{not json</script>
<script>alert('x')</script><style>.a{}</style>
</head><body><header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
<main><article><h1>Payment reconciliation at Northwind Bank</h1>
<p>Northwind Bank SA reconciles 2.3 million payments per day across 14 countries. Founded in 1998 in Brussels, Belgium, the bank is the largest payment processor in the Benelux.</p>
<h2>What is reconciliation?</h2><p>Reconciliation is the process of matching internal records with bank statements. We believe it might be the most important control.</p>
<time datetime="2026-03-01" itemprop="datePublished">1 March 2026</time>
<ul><li>Step one</li><li>Step two</li></ul><table><tr><td>x</td></tr></table>
<p>Contact <a href="mailto:x@northwind.example">us</a> or read the <a href="/faq" rel="nofollow">FAQ</a>.</p>
<img src="/a.png" alt="Diagram"><img src="/b.png"></article></main>
<footer>© Northwind Bank</footer></body></html>`;

test('extractHtml pulls metadata, JSON-LD, headings, main text and structure without executing scripts', () => {
  const p = extractHtml(SAMPLE);
  assert.equal(p.title, 'Payment Reconciliation & Reporting | Northwind Bank');
  assert.equal(p.lang, 'en');
  assert.equal(p.canonical, 'https://www.northwind.example/reconciliation');
  assert.equal(p.metaDescription, 'How Northwind Bank reconciles payments.');
  assert.equal(p.og['og:title'], 'Payment Reconciliation');
  assert.deepEqual(p.hreflang, [{ lang: 'fr', href: 'https://www.northwind.example/fr/reconciliation' }]);
  assert.equal(p.jsonLd.length, 1);
  assert.equal(p.jsonLdErrors, 1);
  assert.deepEqual(p.headings.map((h) => [h.level, h.text]), [[1, 'Payment reconciliation at Northwind Bank'], [2, 'What is reconciliation?']]);
  assert.ok(p.text.includes('2.3 million payments'));
  assert.ok(!p.text.includes('alert('));
  assert.ok(!p.text.includes('Home'), 'nav text must not be in main text');
  assert.ok(p.fullText.includes('Home'));
  assert.equal(p.hasMain, true);
  assert.equal(p.hasArticle, true);
  assert.ok(p.landmarks.includes('nav') && p.landmarks.includes('footer'));
  assert.equal(p.tables, 1);
  assert.equal(p.lists, 1);
  assert.equal(p.images.length, 2);
  assert.equal(p.images.filter((i) => !i.alt).length, 1);
  assert.equal(p.dates.published, '2026-03-01');
  assert.equal(p.links.find((l) => l.href === '/faq')?.rel, 'nofollow');
  assert.ok(p.wordCount > 40);
  assert.equal(decodeEntities('&eacute;&#233;&#xE9;&amp;'), 'ééé&');
});

test('extractText handles markdown headings', () => {
  const r = extractText('# Title\n\nBody text.\n\n## Sub\n\nMore.');
  assert.deepEqual(r.headings.map((h) => h.text), ['Title', 'Sub']);
  assert.ok(r.text.startsWith('Title'));
});

test('chunkText respects target size, keeps heading paths and overlaps', () => {
  const p = extractHtml(SAMPLE);
  const long = p.text + '\n\n' + Array.from({ length: 40 }, (_, i) => `Sentence number ${i} explains a detail about reconciliation controls in some depth.`).join(' ');
  const chunks = chunkText(long, p.headings, { targetChars: 500, overlapChars: 80, minChars: 100 });
  assert.ok(chunks.length >= 4);
  assert.equal(chunks[0]?.headingPath, 'Payment reconciliation at Northwind Bank');
  for (const c of chunks) assert.ok(c.text.length <= 520, `chunk too long: ${c.text.length}`);
  for (let i = 1; i < chunks.length; i++) assert.ok((chunks[i] as { charStart: number }).charStart < (chunks[i - 1] as { charEnd: number }).charEnd, 'chunks should overlap');
  assert.ok(chunks.some((c) => c.headingPath.includes('What is reconciliation?')));
  assert.deepEqual(chunkText(''), []);
});

test('extractClaims finds statistics, temporal, superlative and definition claims and lowers hedged confidence', () => {
  const p = extractHtml(SAMPLE);
  const claims = extractClaims(p.text);
  const kinds = new Map(claims.map((c) => [c.kind, c]));
  assert.ok(kinds.has('statistic'), 'statistic');
  assert.ok(kinds.get('statistic')?.figures.some((f) => /million/.test(f)));
  assert.ok(kinds.has('superlative') || kinds.has('temporal'), 'founded/largest sentence');
  const def = claims.find((c) => c.kind === 'definition');
  assert.ok(def && def.text.startsWith('Reconciliation is the process'));
  const hedged = claims.find((c) => /might be/.test(c.text));
  assert.ok(hedged && hedged.confidence < 0.7, 'hedged superlative has lowered confidence');
  assert.ok(!claims.some((c) => c.text.endsWith('?')));
});

test('extractEntities + resolveEntities merge variants and flag inconsistencies', () => {
  const text = 'Northwind Bank SA operates in Belgium. Customers of Northwind Bank praise the platform. NORTHWIND BANK was founded by Dr. Anna Peeters in Brussels. The Evidentia platform helps.';
  const mentions = extractEntities(text);
  const entities = resolveEntities(mentions);
  const nw = entities.find((e) => e.canonical === 'northwind bank');
  assert.ok(nw, 'northwind bank resolved');
  assert.equal(nw.kind, 'organisation');
  assert.ok(nw.mentions >= 3);
  assert.ok(entities.some((e) => e.canonical === 'brussels' && e.kind === 'place'));
  assert.ok(entities.some((e) => e.canonical === 'anna peeters' && e.kind === 'person'));
  const inconsistencies = entityInconsistencies(entities);
  assert.ok(inconsistencies.some((i) => i.canonical === 'northwind bank' && i.variants.length >= 2));
});
