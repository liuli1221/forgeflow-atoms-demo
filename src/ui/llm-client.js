async function parse(response) {
  const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
  if (body && typeof body.ok === 'boolean') return body;
  if (!response.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), { status: response.status, body });
  return body;
}

export function createLlmClient() {
  return {
    async generate(payload, options = {}) {
      const response = await fetch('./api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal,
      });
      return parse(response);
    },
  };
}
