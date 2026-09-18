/** Minimal static file server for e2e runs (no dependencies). Usage: node serve-static.ts <dir> <port> */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'website/dist');
const port = Number(process.argv[3] ?? 8788);
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path.endsWith('/')) path += 'index.html';
    let file = join(root, path);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    // Mirrors "clean URL" hosting: /docs → docs.html, or docs/index.html when it exists.
    try {
      const s = await stat(file);
      if (s.isDirectory()) {
        const index = join(file, 'index.html');
        const sibling = `${file.replace(/[\\/]+$/, '')}.html`;
        file = await stat(index).then(() => index).catch(() => sibling);
      }
    } catch {
      if (!extname(file)) file = `${file}.html`;
    }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(port, '127.0.0.1', () => process.stdout.write(`static server on http://127.0.0.1:${port}/ (${root})\n`));
