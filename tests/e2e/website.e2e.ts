import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SITE = 'http://127.0.0.1:8788';
const pages = ['/', '/product', '/geo-aeo', '/ai-visibility', '/trusted-knowledge', '/governance', '/eu-readiness', '/security', '/architecture', '/installation', '/use-cases', '/why', '/faq', '/licence', '/privacy', '/legal', '/contact', '/changelog', '/docs', '/docs/getting-started', '/docs/cli', '/docs/skill', '/docs/policies'];

test('home page renders the hero, the Clixite mark and valid JSON-LD', async ({ page }) => {
  await page.goto(`${SITE}/`);
  await expect(page.locator('h1')).toContainText('discovered, understood and cited');
  await expect(page.locator('footer')).toContainText('Built and maintained by Clixite SRL — Belgium');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld ?? '{}') as { '@graph': { '@type': string }[] };
  const types = parsed['@graph'].map((n) => n['@type']);
  expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'SoftwareApplication', 'WebPage']));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://evidentia.clixite.eu');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('every page has one H1, landmarks, canonical, description, and no client scripts', async ({ page }) => {
  for (const path of pages) {
    const res = await page.goto(`${SITE}${path}`);
    expect(res?.status(), path).toBe(200);
    expect(await page.locator('h1').count(), `${path} h1`).toBe(1);
    expect(await page.locator('main#main').count(), `${path} main`).toBe(1);
    expect(await page.locator('nav[aria-label="Main"]').count(), `${path} nav`).toBe(1);
    expect(await page.locator('link[rel="canonical"]').getAttribute('href'), `${path} canonical`).toBe(`https://evidentia.clixite.eu${path === '/' ? '' : path}`);
    expect((await page.locator('meta[name="description"]').getAttribute('content'))?.length ?? 0, `${path} description`).toBeGreaterThan(60);
    expect(await page.locator('script:not([type="application/ld+json"])').count(), `${path} no scripts`).toBe(0);
  }
});

test('sitemap, robots and llms.txt are served and consistent', async ({ request }) => {
  const sitemap = await request.get(`${SITE}/sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  for (const p of pages) expect(xml).toContain(`<loc>https://evidentia.clixite.eu${p === '/' ? '' : p}</loc>`);
  const robots = await (await request.get(`${SITE}/robots.txt`)).text();
  expect(robots).toContain('Sitemap: https://evidentia.clixite.eu/sitemap.xml');
  const llms = await (await request.get(`${SITE}/llms.txt`)).text();
  expect(llms).toContain('# Evidentia');
  expect(llms).toMatch(/not a standard/);
});

test('keyboard navigation reaches the skip link and main content', async ({ page }) => {
  await page.goto(`${SITE}/product`);
  await page.keyboard.press('Tab');
  await expect(page.locator('a.skip')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('accessibility: no serious or critical axe violations on key pages', async ({ page }) => {
  for (const path of ['/', '/geo-aeo', '/eu-readiness', '/installation', '/faq']) {
    await page.goto(`${SITE}${path}`);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${path}: ${v.id} — ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});

test('responsive: no horizontal overflow at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ['/', '/eu-readiness', '/docs/cli']) {
    await page.goto(`${SITE}${path}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflow`).toBeLessThanOrEqual(1);
  }
});
