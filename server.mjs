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
import { createSyncStore } from './server/sync-store.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.FORGEFLOW_DATA_FILE || join(ROOT, '.data', 'sync.json');
const SESSION_SECRET = process.env.FORGEFLOW_SESSION_SECRET || 'forgeflow-local-dev-secret';
const syncStore = createSyncStore({ filePath: DATA_FILE, secret: SESSION_SECRET });
const MAX_BODY = 5 * 1024 * 1024;

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

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('请求体超过 5MB。'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON。'), { status: 400 });
  }
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function handleApi(req, res, urlPath) {
  try {
    if (urlPath === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, service: 'forgeflow-sync', storage: 'server' });
      return;
    }
    if (urlPath === '/api/auth/register' && req.method === 'POST') {
      const body = await readJson(req);
      const result = await syncStore.register(body.username, body.password);
      sendJson(res, result.status, result);
      return;
    }
    if (urlPath === '/api/auth/login' && req.method === 'POST') {
      const body = await readJson(req);
      const result = await syncStore.login(body.username, body.password);
      sendJson(res, result.status, result);
      return;
    }
    if (urlPath === '/api/sync' && req.method === 'GET') {
      const result = await syncStore.read(bearer(req));
      sendJson(res, result.status, result);
      return;
    }
    if (urlPath === '/api/sync' && req.method === 'PUT') {
      const body = await readJson(req);
      const result = await syncStore.write(bearer(req), body.baseRevision, body.snapshot);
      sendJson(res, result.status, result);
      return;
    }
    sendJson(res, 404, { ok: false, error: 'API 不存在。' });
  } catch (err) {
    sendJson(res, Number(err && err.status) || 500, { ok: false, error: String(err && err.message || err) });
  }
}

const server = createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath.startsWith('/api/')) {
    await handleApi(req, res, urlPath);
    return;
  }
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
