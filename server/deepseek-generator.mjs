import { randomUUID } from 'node:crypto';
import { validateGeneratedBundle } from './llm-validator.mjs';

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['appName', 'appType', 'summary', 'acceptanceCriteria', 'files'],
  properties: {
    appName: { type: 'string' },
    appType: { type: 'string', enum: ['crud', 'utility', 'game', 'dashboard', 'custom'] },
    summary: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    files: {
      type: 'object',
      additionalProperties: false,
      required: ['index.html', 'styles.css', 'app.js'],
      properties: {
        'index.html': { type: 'string' },
        'styles.css': { type: 'string' },
        'app.js': { type: 'string' },
      },
    },
  },
};

const SYSTEM_INSTRUCTIONS = `You are the code-generation engine inside ForgeFlow. Generate the application the user actually requested. Never replace a calculator, game, timer, drawing tool, or other behavioral application with a generic CRUD list.

Return JSON that matches the supplied schema. Produce exactly three dependency-free browser files: index.html, styles.css, app.js.

Hard requirements:
- index.html is a complete HTML5 document and the main container has data-testid="app-root".
- It contains exactly <link rel="stylesheet" href="./styles.css" /> and <script type="module" src="./app.js"></script> as its only stylesheet/script references.
- No CDN, package, external URL, image URL, fetch, XHR, WebSocket, iframe, eval, innerHTML, outerHTML, document.write, localStorage, sessionStorage, inline event handler, import, or export.
- Build DOM with createElement/textContent and addEventListener. Use Canvas only when appropriate.
- Include responsive CSS and accessible labels/buttons.
- Treat the application id supplied in the user message as opaque and copy it exactly into the persistence bridge.
- Any application with mutable user data (CRUD, tracker, manager, collection, form, notes, CRM, budget, habit, inventory, library, feedback, etc.) must persist through the ForgeFlow postMessage bridge: use key "forgeflow.appdata.<application-id>"; send {source:"forgeflow-app",type:"ready",appId}; listen for {source:"forgeflow-host",type:"init",data}; and send {source:"forgeflow-app",type:"save",key,data} after every mutation. Never use browser storage directly.
- A CRUD/data-management application must expose item-list, item-add, item-form, item-title, and item-save via data-testid. Clicking item-add must reveal item-form; item-title is the primary create input; item-save must be the visible submit button that creates a new item. Do not place item-save on an edit-only or permanently hidden control. Implement the requested add/edit/delete/search/filter behavior instead of returning a decorative mockup.
- A calculator must expose: calculator-display, key-7, key-add, key-5, key-equals, key-clear via data-testid and support 7 + 5 = 12.
- A snake game must expose: snake-canvas, snake-score, snake-start, snake-status via data-testid; the start button must set snake-status text exactly to "running"; support arrow keys, score, collision/game-over, and restart.
- Keep all code self-contained and production-readable. Keep the complete JSON response under 18000 characters so it is not truncated.`;

function extractOutputText(payload) {
  const parts = [];
  for (const item of payload && Array.isArray(payload.output) ? payload.output : []) {
    if (item && item.type === 'message') {
      for (const content of Array.isArray(item.content) ? item.content : []) {
        if (content && content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
      }
    }
  }
  return parts.join('').trim();
}

function compactUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  return {
    inputTokens: Number(usage.input_tokens || 0),
    outputTokens: Number(usage.output_tokens || 0),
    totalTokens: Number(usage.total_tokens || 0),
  };
}

function parseArtifactText(text) {
  const candidates = [String(text || '').trim()];
  const unfenced = candidates[0]
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (unfenced && unfenced !== candidates[0]) candidates.push(unfenced);
  const firstBrace = unfenced.indexOf('{');
  const lastBrace = unfenced.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(unfenced.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* try next deterministic extraction */ }
  }
  throw Object.assign(new Error(`DeepSeek 返回内容不是合法 JSON（${String(text || '').length} 字符）。`), {
    rawText: String(text || '').slice(0, 200_000),
  });
}

function makeSpec(prompt, artifact, options) {
  const appId = options.appId;
  return {
    specVersion: 1,
    appId,
    appName: String(artifact.appName || 'AI 生成应用').slice(0, 40),
    tagline: String(artifact.summary || '').slice(0, 120),
    domain: 'custom',
    entityName: '应用状态',
    theme: { mode: 'light', accent: '#4f6bed' },
    layout: { view: 'cards', showSearch: false, showStats: false, showFilters: false },
    fields: [{ key: 'state', label: '运行状态', type: 'text', required: false, primary: true }],
    filters: [],
    metrics: [],
    seedItems: [],
    sourcePrompt: String(prompt || ''),
    engine: 'deepseek',
    appType: artifact.appType,
    acceptanceCriteria: artifact.acceptanceCriteria,
  };
}

function promptForAttempt(input, previous, errors, attempt) {
  const base = `User request:\n${input.prompt}\n\nApplication id (copy exactly for the ForgeFlow persistence bridge): ${input.appId}\n\nThis is a ${input.mode || 'create'} request. Build a real working application, not a description.`;
  if (!previous) return base;
  if (attempt === 1 && errors.length === 0) {
    return `${base}\n\nModify the following existing application to satisfy the user request. Preserve working behavior that the request does not change.\n\nExisting JSON bundle:\n${JSON.stringify(previous)}\n\nReturn the complete updated JSON bundle.`;
  }
  return `${base}\n\nRepair attempt ${attempt}. The previous generated bundle failed deterministic validation:\n- ${errors.join('\n- ')}\n\nPrevious JSON bundle:\n${JSON.stringify(previous)}\n\nReturn a corrected complete JSON bundle.`;
}

async function callDeepSeek(input, config, previous, errors, attempt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const onAbort = () => controller.abort();
  if (config.signal) config.signal.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await config.fetch(`${config.baseUrl.replace(/\/$/, '')}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        instructions: SYSTEM_INSTRUCTIONS,
        input: promptForAttempt(input, previous, errors, attempt),
        reasoning: { effort: 'none' },
        max_output_tokens: 24_000,
        text: { format: { type: 'json_schema', name: 'forgeflow_app', schema: OUTPUT_SCHEMA } },
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload && payload.error && payload.error.message ? payload.error.message : `DeepSeek HTTP ${response.status}`;
      throw Object.assign(new Error(message), { status: response.status });
    }
    if (payload.status && payload.status !== 'completed') {
      throw new Error(payload.error && payload.error.message ? payload.error.message : `DeepSeek response status: ${payload.status}`);
    }
    const text = extractOutputText(payload);
    if (!text) throw new Error('DeepSeek 返回了空内容。');
    const artifact = parseArtifactText(text);
    return { artifact, responseId: payload.id || '', usage: compactUsage(payload.usage) };
  } finally {
    clearTimeout(timeout);
    if (config.signal) config.signal.removeEventListener('abort', onAbort);
  }
}

export async function generateWithDeepSeek(input, options = {}) {
  const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { ok: false, error: '服务端未配置 DEEPSEEK_API_KEY。', attempts: [] };
  const config = {
    apiKey,
    baseUrl: options.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: options.model || process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    fetch: options.fetch || globalThis.fetch,
    timeoutMs: Number(options.timeoutMs || process.env.DEEPSEEK_TIMEOUT_MS || 60_000),
    signal: options.signal,
  };
  if (typeof config.fetch !== 'function') return { ok: false, error: '当前 Node 运行时不支持 fetch。', attempts: [] };

  const requestedAppId = String(input && input.appId || '').trim();
  const appId = /^[A-Za-z0-9_-]{1,80}$/.test(requestedAppId)
    ? requestedAppId
    : `app_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const request = { ...input, appId };

  const attempts = [];
  let previous = request.previousArtifact || null;
  let errors = [];
  let lastError = '';
  const maxAttempts = Math.min(3, Math.max(1, Number(options.maxAttempts || 3)));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const generated = await callDeepSeek(request, config, previous, errors, attempt);
      const report = validateGeneratedBundle(request.prompt, generated.artifact, { appId });
      attempts.push({ attempt, ok: report.ok, errors: report.errors, responseId: generated.responseId, usage: generated.usage });
      if (report.ok) {
        return {
          ok: true,
          provider: 'deepseek',
          model: config.model,
          artifact: generated.artifact,
          spec: makeSpec(request.prompt, generated.artifact, request),
          files: generated.artifact.files,
          checks: report.checks,
          attempts,
          usage: generated.usage,
        };
      }
      previous = generated.artifact;
      errors = report.errors;
      lastError = `生成结果未通过校验：${errors.join('；')}`;
    } catch (error) {
      if (error && error.name === 'AbortError') return { ok: false, cancelled: true, error: '生成已取消。', attempts };
      lastError = String(error && error.message || error);
      attempts.push({ attempt, ok: false, errors: [lastError], responseId: '', usage: null });
      if (error && [400, 401, 403, 404].includes(error.status)) {
        return { ok: false, error: lastError, attempts };
      }
      if (error && error.rawText) previous = { invalidJsonOutput: error.rawText };
      errors = [lastError];
    }
  }
  return { ok: false, error: `${lastError || '生成失败'}（已自动尝试 ${attempts.length} 次）`, attempts };
}
