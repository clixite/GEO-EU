import { defineConfig } from 'astro/config';

// Static-first: no server, no client framework, no third-party scripts.
export default defineConfig({
  site: 'https://evidentia.clixite.eu',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  compressHTML: true,
  prefetch: false,
});
