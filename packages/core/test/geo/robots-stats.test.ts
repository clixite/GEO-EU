import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAiAccess, isAllowed, parseRobots } from '../../src/geo/robots.ts';
import { isSignificantChange, samplesForHalfWidth, twoProportionPValue, wilson } from '../../src/observatory/stats.ts';

const ROBOTS = `# example
User-agent: *
Disallow: /private/
Allow: /private/public-note
Sitemap: https://example.com/sitemap.xml

User-agent: GPTBot
User-agent: CCBot
Disallow: /

User-agent: OAI-SearchBot
Allow: /
Disallow: /drafts/*.html$
`;

test('parseRobots + isAllowed implement longest-match precedence, wildcards and group selection', () => {
  const doc = parseRobots(ROBOTS);
  assert.deepEqual(doc.sitemaps, ['https://example.com/sitemap.xml']);
  assert.equal(doc.groups.length, 3);
  assert.equal(isAllowed(doc, 'Googlebot', '/private/x').allowed, false);
  assert.equal(isAllowed(doc, 'Googlebot', '/private/public-note').allowed, true, 'longer allow wins');
  assert.equal(isAllowed(doc, 'Googlebot', '/public').allowed, true);
  assert.equal(isAllowed(doc, 'GPTBot', '/anything').allowed, false);
  assert.equal(isAllowed(doc, 'CCBot', '/').allowed, false);
  assert.equal(isAllowed(doc, 'OAI-SearchBot', '/drafts/a.html').allowed, false);
  assert.equal(isAllowed(doc, 'OAI-SearchBot', '/drafts/a.htmlx').allowed, true, '$ anchors the end');
  assert.equal(isAllowed(doc, 'OAI-SearchBot', '/private/x').allowed, true, 'specific group replaces wildcard group entirely');
});

test('evaluateAiAccess reports every catalogued agent with purpose and engine', () => {
  const access = evaluateAiAccess(ROBOTS, '/private/x');
  const byToken = Object.fromEntries(access.map((a) => [a.token, a]));
  assert.equal(byToken['GPTBot']?.allowed, false);
  assert.equal(byToken['GPTBot']?.purpose, 'training');
  assert.equal(byToken['OAI-SearchBot']?.allowed, true);
  assert.equal(byToken['Googlebot']?.allowed, false);
  assert.equal(byToken['Perplexity-User']?.honoursRobots, false);
  const open = evaluateAiAccess(null, '/x');
  assert.ok(open.every((a) => a.allowed));
});

test('wilson intervals behave at the edges and shrink with n', () => {
  const zero = wilson(0, 10);
  assert.equal(zero.low, 0);
  assert.ok(zero.high > 0 && zero.high < 0.35);
  const full = wilson(10, 10);
  assert.equal(full.high, 1);
  assert.ok(full.low > 0.65);
  const small = wilson(16, 32);
  const large = wilson(50, 100);
  assert.ok(Math.abs(small.halfWidth - 0.17) < 0.02, `n=32 half-width ${small.halfWidth}`);
  assert.ok(Math.abs(large.halfWidth - 0.1) < 0.01, `n=100 half-width ${large.halfWidth}`);
  assert.deepEqual(wilson(0, 0).n, 0);
  assert.ok(samplesForHalfWidth(0.5, 0.1) >= 90 && samplesForHalfWidth(0.5, 0.1) <= 120);
});

test('two-proportion test distinguishes real change from noise', () => {
  assert.ok(twoProportionPValue(10, 100, 12, 100) > 0.05);
  assert.ok(twoProportionPValue(10, 100, 30, 100) < 0.01);
  assert.equal(isSignificantChange(wilson(3, 32), wilson(5, 32)), false);
  assert.equal(isSignificantChange(wilson(10, 200), wilson(40, 200)), true);
});
