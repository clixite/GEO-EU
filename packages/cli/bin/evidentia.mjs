#!/usr/bin/env node
// Evidentia CLI entry point. Requires Node >= 24 (native TypeScript execution).
const [major] = process.versions.node.split('.').map(Number);
if (major < 24) {
  process.stderr.write(`Evidentia requires Node.js 24 or newer (found ${process.versions.node}).\n`);
  process.exit(2);
}
const { main } = await import('../src/main.ts');
process.exitCode = await main(process.argv.slice(2));
