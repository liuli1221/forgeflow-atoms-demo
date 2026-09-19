/**
 * ForgeFlow static dev server.
 *
 * Zero dependencies: only Node.js built-ins. Serves the repository root as a
 * static site so the app runs exactly the same way it will on GitHub Pages.
 *
 *   node server.mjs           -> http://127.0.0.1:4173
 *   PORT=8080 node server.mjs -> http://127.0.0.1:8080
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
  const abs = join(ROOT, rel);
  if (!abs.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep) && abs !== ROOT.replace(/[/\\]$/, '')) {
    return null;
  }
  return abs;
}

async function resolveFile(abs) {
  try {
    const info = await stat(abs);
    if (info.isDirectory()) {
      const indexPath = join(abs, 'index.html');
      const indexInfo = await stat(indexPath);
      if (indexInfo.isFile()) return indexPath;
      return null;
    }
    return info.isFile() ? abs : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'GET, HEAD' });
    res.end('405 Method Not Allowed');
    return;
  }

  const abs = safeResolve(req.url || '/');
  if (!abs) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  const file = await resolveFile(abs);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found: ' + (req.url || '/'));
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error\n' + String(err && err.message));
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`ForgeFlow dev server running at http://${HOST}:${PORT}\n`);
  process.stdout.write(`Serving: ${ROOT}\n`);
});
