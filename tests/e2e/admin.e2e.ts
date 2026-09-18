import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ADMIN = 'http://127.0.0.1:8787';

async function login(page: Page, token: string): Promise<void> {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Access token').fill(token);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(`${ADMIN}/`);
}

test('critical flow: ingest → draft → verify → gate → approve (second user) → publish, all visible in the audit trail', async ({ browser }) => {
  const writer = await browser.newContext();
  const wp = await writer.newPage();
  await login(wp, 'writer-e2e-token');
  await expect(wp.getByRole('heading', { level: 1 })).toHaveText('Executive overview');

  await wp.goto(`${ADMIN}/knowledge`);
  await wp.getByLabel('Locator (URL or path)').fill('https://www.northwind.example/reconciliation');
  await wp.getByLabel('Authority level').selectOption('official');
  await wp.getByLabel('Content (HTML, Markdown or text)').fill('Northwind Bank SA reconciles 2.3 million payments per day across 14 countries. Escalated breaks are resolved within 30 days.');
  await wp.getByRole('button', { name: 'Ingest' }).click();
  await expect(wp.locator('[role="status"]')).toContainText('Ingested');

  await wp.goto(`${ADMIN}/drafts`);
  await wp.getByLabel('Title').fill('Reconciliation at Northwind');
  await wp.getByLabel('Slug').fill(`reconciliation-e2e-${test.info().project.name}-${Date.now().toString(36)}`);
  await wp.getByLabel(/Evidence query/).fill('payments per day');
  await wp.getByLabel(/Body/).fill('Northwind Bank reconciles 2.3 million payments per day across 14 countries [E1].');
  await wp.getByLabel(/Topics/).fill('finance');
  await wp.getByRole('button', { name: 'Create draft' }).click();
  await expect(wp).toHaveURL(/\/drafts\/[0-9a-f-]+/);
  const draftUrl = wp.url().split('?')[0] as string;

  await wp.getByRole('button', { name: 'Verify evidence' }).click();
  await expect(wp.locator('[role="status"]')).toContainText('all claims supported');
  await wp.getByRole('button', { name: 'Apply publication policy' }).click();
  await expect(wp.locator('[role="status"]')).toContainText('require_approval');
  await expect(wp.getByRole('button', { name: 'Approve' })).toHaveCount(0); // editor role cannot approve

  const approver = await browser.newContext();
  const ap = await approver.newPage();
  await login(ap, 'editor-e2e-token');
  await ap.goto(draftUrl);
  await ap.getByLabel('Approval note').fill('checked');
  await ap.getByRole('button', { name: 'Approve' }).click();
  await expect(ap.locator('[role="status"]')).toContainText('approved');
  await ap.getByLabel('Editorial responsibility — name').fill('Anna Peeters');
  await ap.getByLabel('Role').fill('Head of Communications');
  await ap.getByRole('button', { name: 'Publish (static export)' }).click();
  await expect(ap.locator('[role="status"]')).toContainText('Published');
  await expect(ap.locator('main')).toContainText('draft.publish');

  await ap.goto(`${ADMIN}/audit`);
  await expect(ap.locator('[role="status"], .notice')).toContainText('Ledger intact');
  await expect(ap.locator('main')).toContainText('approval.consume');
  await writer.close();
  await approver.close();
});

test('security: forged cookie is rejected, CSRF-less POST is refused, headers are strict', async ({ page, request }) => {
  const res = await request.get(`${ADMIN}/`, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()['content-security-policy']).toContain("default-src 'none'");
  expect(res.headers()['x-frame-options']).toBe('DENY');
  await login(page, 'writer-e2e-token');
  const noCsrf = await page.request.post(`${ADMIN}/knowledge/ingest`, { form: { locator: 'x', content: 'y' }, maxRedirects: 0 });
  expect(noCsrf.status()).toBe(403);
  await page.context().addCookies([{ name: 'ev_session', value: 'forged.value', url: ADMIN }]);
  const forged = await page.request.get(`${ADMIN}/governance`, { maxRedirects: 0 });
  expect(forged.status()).toBe(302);
});

test('accessibility of the console on key views', async ({ page }) => {
  await login(page, 'writer-e2e-token');
  for (const path of ['/', '/knowledge', '/drafts', '/governance/models', '/audit']) {
    await page.goto(`${ADMIN}${path}`);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${path}: ${v.id} — ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }
});
