import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the governance console and the public website.
 * The console is started with a throwaway store and demo users; the website is
 * served from its static build.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.e2e\.ts/,
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node --disable-warning=ExperimentalWarning apps/admin/src/server.ts',
      cwd: '..' + '/..',
      url: 'http://127.0.0.1:8787/healthz',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        EVIDENTIA_DB: ':memory:',
        EVIDENTIA_TENANT: 'e2e',
        EVIDENTIA_ADMIN_SECRET: 'e2e-secret-that-is-at-least-32-characters-long',
        EVIDENTIA_ADMIN_USERS: JSON.stringify([
          { name: 'writer@e2e.example', role: 'editor', tokenHash: 'cffb9f65cf2b287393ff0a931afd40f39801a7c08744b6209b918274ea861142' },
          { name: 'editor@e2e.example', role: 'approver', tokenHash: '566acc6d9056ec0e4403aea52c1c66506dc36943421d6a030bb5167eef174139' },
        ]),
        PORT: '8787',
        HOST: '127.0.0.1',
      },
    },
    {
      command: 'node --disable-warning=ExperimentalWarning tests/e2e/serve-static.ts website/dist 8788',
      cwd: '..' + '/..',
      url: 'http://127.0.0.1:8788/',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
