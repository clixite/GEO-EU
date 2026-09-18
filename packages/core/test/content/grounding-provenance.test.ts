import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedPrompt, renderWithSources, stripMarkers, verifyDraft, type EvidenceItem } from '../../src/content/grounding.ts';
import { markdownToHtml } from '../../src/content/markdown.ts';
import { createManifest, generateSigningKey, jsonForScript, markingArtifacts, signManifest, verifyManifest } from '../../src/governance/provenance.ts';

const EVIDENCE: EvidenceItem[] = [
  { id: 'E1', text: 'Northwind Bank SA reconciles 2.3 million payments per day across 14 countries.', locator: 'https://www.northwind.example/reconciliation', title: 'Payment reconciliation', headingPath: '', authorityLevel: 'official', modifiedAt: '2026-08-15' },
  { id: 'E2', text: 'Customer support recordings are deleted after 90 days. Erasure requests are handled within 30 days.', locator: 'https://www.northwind.example/privacy/retention', title: 'Data retention policy', headingPath: 'Erasure requests', authorityLevel: 'official', modifiedAt: '2026-03-01' },
];

test('grounded prompt carries the rules and numbered evidence', () => {
  const msgs = buildGroundedPrompt({ title: 'How we reconcile payments', audience: 'treasury teams', intent: 'explain controls', brand: 'Northwind Bank' }, EVIDENCE);
  assert.equal(msgs[0]?.role, 'system');
  assert.match(msgs[0]?.content ?? '', /NEEDS EVIDENCE/);
  assert.match(msgs[1]?.content ?? '', /\[E1\] \(official; Payment reconciliation/);
  assert.match(msgs[1]?.content ?? '', /Organisation: Northwind Bank/);
});

test('verifyDraft supports cited claims, catches fabricated figures, unsupported superlatives and placeholders', () => {
  const draft = `# Payment reconciliation at Northwind Bank

Northwind Bank reconciles 2.3 million payments per day across 14 countries [E1]. Support recordings are deleted after 90 days [E2].
Northwind Bank is the largest payment processor in the Benelux [E1]. Erasure requests are handled within 45 days [E2].
[NEEDS EVIDENCE: number of employees]`;
  const r = verifyDraft(draft, EVIDENCE);
  assert.equal(r.placeholders.length, 1);
  const byText = (s: string) => r.claims.find((c) => c.text.startsWith(s));
  assert.equal(byText('Northwind Bank reconciles')?.supported, true);
  assert.deepEqual(byText('Northwind Bank reconciles')?.supportedBy, ['E1']);
  assert.equal(byText('Support recordings')?.supported, true);
  const superlative = byText('Northwind Bank is the largest');
  assert.equal(superlative?.supported, false);
  assert.ok(r.superlativesWithoutEvidence.length === 1);
  const fabricated = byText('Erasure requests are handled within 45');
  assert.equal(fabricated?.supported, false);
  assert.match(fabricated?.reason ?? '', /does not contain figure\(s\): 45/);
  assert.equal(r.materialClaims, 4);
  assert.equal(r.unsupportedClaims, 2);
  assert.ok(Math.abs(r.evidenceCoverage - 0.5) < 1e-9);
  assert.deepEqual(r.citedEvidenceIds, ['E1', 'E2']);
});

test('uncited but closely matching sentences are auto-linked; uncited invented facts are not', () => {
  const r = verifyDraft('Customer support recordings are deleted after 90 days. The bank won an innovation award in 2024.', EVIDENCE);
  assert.equal(r.claims.find((c) => c.text.startsWith('Customer support'))?.supported, true);
  assert.equal(r.claims.find((c) => c.text.startsWith('The bank won'))?.supported, false);
});

test('renderWithSources turns markers into footnotes and markdownToHtml escapes untrusted content', () => {
  const md = renderWithSources('Facts [E2] and more facts [E1] and again [E2].', EVIDENCE);
  assert.match(md, /Facts \[\^1\] and more facts \[\^2\] and again \[\^1\]\./);
  assert.match(md, /## Sources/);
  assert.match(md, /\[\^1\]: Data retention policy — Erasure requests/);
  assert.equal(stripMarkers('A fact [E1]. Another [E2] [E3].'), 'A fact. Another.');
  const html = markdownToHtml('# Title <script>\n\nPara with **bold** and [link](https://a.example) and [bad](javascript:alert(1)).\n\n- one\n- two\n\n> quote');
  assert.match(html, /<h1>Title &lt;script&gt;<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<a href="https:\/\/a.example" rel="noopener">link<\/a>/);
  assert.match(html, /<a href="#">bad<\/a>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<blockquote><p>quote<\/p><\/blockquote>/);
});

test('provenance manifest is signed, verifiable, bound to content and rendered as marking artefacts', () => {
  const key = generateSigningKey();
  const manifest = createManifest({
    content: 'Body text', title: 'T', generatedAt: '2026-09-18T10:00:00Z', aiAssisted: true, humanEdited: true, models: ['eu-llm/eu-large'], generationLogIds: ['call-1'], evidenceSources: ['https://www.northwind.example/reconciliation'],
    editorialResponsibility: { name: 'Anna Peeters', role: 'Head of Communications', approvedAt: '2026-09-18T11:00:00Z', approvalId: 'a1', approvedBy: 'editor@northwind.example' }, publisher: 'Northwind Bank SA',
  });
  assert.equal(manifest.digitalSourceType, 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia');
  assert.match(manifest.disclosure, /approved by editor@northwind\.example \(approval a1\)/);
  assert.match(manifest.disclosure, /editorial responsibility of Anna Peeters \(Head of Communications\)/);
  const signed = signManifest(manifest, key);
  assert.deepEqual(verifyManifest(signed, key.publicKeyPem, 'Body text'), { valid: true, reason: 'ok' });
  assert.equal(verifyManifest(signed, key.publicKeyPem, 'Body text edited').valid, false);
  const tampered = { ...signed, manifest: { ...signed.manifest, aiAssisted: false } };
  assert.equal(verifyManifest(tampered, key.publicKeyPem).valid, false);
  const other = generateSigningKey();
  assert.equal(verifyManifest(signed, other.publicKeyPem).valid, false);
  const art = markingArtifacts(signed, { manifestUrl: 'https://www.northwind.example/manifests/1.json' });
  assert.equal(art.jsonLd['iptc:DigitalSourceType'], manifest.digitalSourceType);
  assert.ok(art.metaTags.some((t) => t.includes('ai-assisted; human-reviewed')));
  assert.match(art.visibleNoticeHtml, /AI transparency notice/);
  const human = createManifest({ content: 'x', title: 'T', generatedAt: '2026-09-18T10:00:00Z', aiAssisted: false, models: [], generationLogIds: [], evidenceSources: [], editorialResponsibility: { name: 'A', role: 'B', approvedAt: '2026-09-18', approvalId: null, approvedBy: null }, publisher: 'P' });
  assert.equal(human.digitalSourceType, 'http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture');
  assert.match(human.disclosure, /written without AI assistance and published under the editorial responsibility of A \(B\)/);
});

test('jsonForScript escapes HTML-significant characters so JSON-LD cannot break out of its <script> element', () => {
  const evil = { name: '</script><script>alert(1)</script>', note: 'a & b   c' };
  const escaped = jsonForScript(evil);
  assert.ok(!escaped.includes('</script>'));
  assert.ok(!escaped.includes('<script>alert'));
  assert.match(escaped, /\\u003c\/script\\u003e/);
  assert.match(escaped, /\\u0026/);
  assert.deepEqual(JSON.parse(escaped.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&').replace(/\\u2028/g, ' ')), evil);
});
