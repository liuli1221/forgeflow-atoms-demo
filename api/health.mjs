import { generationGuardFromEnv } from '../server/generation-guard.mjs';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: '仅支持 GET。' }));
    return;
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify({
    ok: true,
    service: 'forgeflow',
    runtime: 'vercel-function',
    storage: 'browser',
    llm: {
      configured: Boolean(process.env.DEEPSEEK_API_KEY),
    },
    generationPolicy: generationGuardFromEnv(process.env).policy(),
  }));
}
