import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createRuntime, DEFAULT_POLICY } from '@evidentia/cli/runtime';
import { createApp } from './app.ts';
import { parseUsers } from './auth.ts';

/**
 * Starts the governance console. Configuration is environment-only:
 *   EVIDENTIA_DB, EVIDENTIA_TENANT, EVIDENTIA_POLICY, EVIDENTIA_SIGNING_KEY,
 *   EVIDENTIA_ADMIN_SECRET (>= 32 chars), EVIDENTIA_ADMIN_USERS (JSON), EVIDENTIA_PUBLISH_DIR,
 *   PORT (default 8787), HOST (default 127.0.0.1 — put a TLS reverse proxy in front).
 */
const env = process.env;
const secret = env['EVIDENTIA_ADMIN_SECRET'];
if (!secret || secret.length < 32) {
  process.stderr.write('EVIDENTIA_ADMIN_SECRET (>= 32 characters) is required\n');
  process.exit(2);
}
const users = parseUsers(env['EVIDENTIA_ADMIN_USERS']);
if (!users.length) {
  process.stderr.write('EVIDENTIA_ADMIN_USERS is required (JSON array of {name, role, tokenHash}); generate a token hash with: node -e "console.log(require(\'crypto\').createHash(\'sha256\').update(process.argv[1]).digest(\'hex\'))" <token>\n');
  process.exit(2);
}
const dbPath = env['EVIDENTIA_DB'] ?? resolve('.evidentia/evidentia.db');
const runtime = createRuntime({
  dbPath,
  tenantId: env['EVIDENTIA_TENANT'] ?? 'default',
  actor: 'console',
  policyPath: env['EVIDENTIA_POLICY'] ?? DEFAULT_POLICY,
  signingKeyPath: env['EVIDENTIA_SIGNING_KEY'] ?? resolve(dbPath, '..', 'signing-key.json'),
});
const app = createApp({ runtime, users, sessionSecret: secret, publishDir: env['EVIDENTIA_PUBLISH_DIR'] ?? resolve('.evidentia/published') });
const port = Number(env['PORT'] ?? 8787);
const hostname = env['HOST'] ?? '127.0.0.1';
serve({ fetch: app.fetch, port, hostname }, (info) => {
  runtime.logger.info('governance console listening', { host: info.address, port: info.port, tenant: runtime.ctx.tenantId });
  process.stdout.write(`Evidentia governance console: http://${info.address}:${info.port}/ (tenant ${runtime.ctx.tenantId})\n`);
});
