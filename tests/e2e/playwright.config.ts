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
          { name: 'writer@e2e.example', role: 'editor', tokenHash: 'a95dde2c959d5f61672dd9e483d458da661eb483ba9105f014f6580ddca68d0b' },
          { name: 'editor@e2e.example', role: 'approver', tokenHash: '1d6e48cc9cdc598c33d46528db30af9858c2b215ecd77065515dbf14db0e11bc' },
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
