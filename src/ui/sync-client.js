const SESSION_KEY = 'forgeflow.sync.session';

function readSession() {
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveSession(value) {
  if (value) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else window.sessionStorage.removeItem(SESSION_KEY);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
  if (!response.ok || !body.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), { status: response.status, body });
  return body;
}

export function createSyncClient() {
  let session = readSession();

  function authHeaders() {
    return session && session.token ? { authorization: `Bearer ${session.token}` } : {};
  }

  function acceptAuth(result) {
    session = { username: result.username, token: result.token, revision: Number(result.revision || 0) };
    saveSession(session);
    return session;
  }

  return {
    session: () => session,
    async health() {
      try {
        return await request('./api/health');
      } catch {
        return { ok: false, service: 'unavailable' };
      }
    },
    async register(username, password) {
      const result = await request('./api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
      return acceptAuth(result);
    },
    async login(username, password) {
      const result = await request('./api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      return acceptAuth(result);
    },
    logout() {
      session = null;
      saveSession(null);
    },
    async pull() {
      if (!session) throw new Error('请先登录。');
      const result = await request('./api/sync', { headers: authHeaders() });
      session.revision = Number(result.revision || 0);
      saveSession(session);
      return result;
    },
    async push(snapshot) {
      if (!session) throw new Error('请先登录。');
      const result = await request('./api/sync', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ baseRevision: session.revision || 0, snapshot }),
      });
      session.revision = Number(result.revision || 0);
      saveSession(session);
      return result;
    },
  };
}
