import { createHash } from 'node:crypto';
import { generateWithDeepSeek } from '../server/deepseek-generator.mjs';
import { generationGuardFromEnv } from '../server/generation-guard.mjs';

const MAX_BODY = 5 * 1024 * 1024;
const generationGuard = generationGuardFromEnv(process.env);

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  res.end(body);
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const address = forwarded[0] || req.socket?.remoteAddress || 'unknown';
  return createHash('sha256').update(address).digest('hex').slice(0, 24);
}

async function readJson(req) {
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > MAX_BODY) throw Object.assign(new Error('请求体超过 5MB。'), { status: 413 });
    try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { throw Object.assign(new Error('请求体不是合法 JSON。'), { status: 400 }); }
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('请求体超过 5MB。'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('请求体不是合法 JSON。'), { status: 400 }); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    sendJson(res, 405, { ok: false, error: '仅支持 POST。' });
    return;
  }

  let permit;
  try {
    const body = await readJson(req);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length < 4 || prompt.length > 4000) {
      sendJson(res, 400, { ok: false, error: 'prompt 长度必须为 4 到 4000 个字符。' });
      return;
    }

    permit = generationGuard.begin(clientKey(req));
    if (!permit.ok) {
      const headers = permit.retryAfterSeconds ? { 'retry-after': String(permit.retryAfterSeconds) } : {};
      sendJson(res, permit.status, { ok: false, code: permit.code, error: permit.error }, headers);
      return;
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once?.('aborted', abort);
    try {
      const result = await generateWithDeepSeek({
        prompt,
        mode: body.mode === 'modify' ? 'modify' : 'create',
        appId: typeof body.appId === 'string' ? body.appId : '',
        previousArtifact: body.previousArtifact && typeof body.previousArtifact === 'object' ? body.previousArtifact : null,
      }, { signal: controller.signal });

      sendJson(res, result.ok ? 200 : result.cancelled ? 499 : 502, result, {
        'x-ratelimit-remaining': String(permit.remaining),
        'x-daily-limit-remaining': String(permit.dailyRemaining),
      });
    } finally {
      req.removeListener?.('aborted', abort);
    }
  } catch (error) {
    sendJson(res, Number(error?.status) || 500, { ok: false, error: String(error?.message || error) });
  } finally {
    permit?.release?.();
  }
}
