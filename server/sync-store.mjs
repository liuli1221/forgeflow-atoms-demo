import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function passwordHash(password, salt) {
  return scryptSync(String(password), salt, 32).toString('hex');
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSyncStore({ filePath, secret }) {
  let db = null;
  let writeQueue = Promise.resolve();

  async function load() {
    if (db) return db;
    try {
      const parsed = JSON.parse(await readFile(filePath, 'utf8'));
      db = parsed && typeof parsed === 'object' && parsed.users ? parsed : { schemaVersion: 1, users: {} };
    } catch {
      db = { schemaVersion: 1, users: {} };
    }
    return db;
  }

  function persist() {
    writeQueue = writeQueue.then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      const temp = `${filePath}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
      await rename(temp, filePath);
    });
    return writeQueue;
  }

  function issueToken(username) {
    const payload = encode(JSON.stringify({ sub: username, exp: Date.now() + TOKEN_TTL_MS }));
    return `${payload}.${sign(payload, secret)}`;
  }

  function verifyToken(token) {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) return null;
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!decoded.sub || Number(decoded.exp) < Date.now()) return null;
      return String(decoded.sub);
    } catch {
      return null;
    }
  }

  return {
    async register(usernameInput, password) {
      const username = normalizeUsername(usernameInput);
      if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
        return { ok: false, status: 400, error: '用户名需为 3-32 位字母、数字、点、横线或下划线。' };
      }
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        return { ok: false, status: 400, error: '密码长度需为 8-128 位。' };
      }
      const current = await load();
      if (current.users[username]) return { ok: false, status: 409, error: '用户名已存在。' };
      const salt = randomBytes(16).toString('hex');
      current.users[username] = {
        username,
        salt,
        passwordHash: passwordHash(password, salt),
        revision: 0,
        snapshot: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await persist();
      return { ok: true, status: 201, username, token: issueToken(username), revision: 0 };
    },

    async login(usernameInput, password) {
      const username = normalizeUsername(usernameInput);
      const current = await load();
      const user = current.users[username];
      if (!user || !safeEqual(user.passwordHash, passwordHash(password, user.salt))) {
        return { ok: false, status: 401, error: '用户名或密码错误。' };
      }
      return { ok: true, status: 200, username, token: issueToken(username), revision: user.revision || 0 };
    },

    async read(token) {
      const username = verifyToken(token);
      if (!username) return { ok: false, status: 401, error: '登录已失效，请重新登录。' };
      const current = await load();
      const user = current.users[username];
      if (!user) return { ok: false, status: 401, error: '账号不存在。' };
      return { ok: true, status: 200, username, revision: user.revision || 0, snapshot: user.snapshot };
    },

    async write(token, baseRevision, snapshot) {
      const username = verifyToken(token);
      if (!username) return { ok: false, status: 401, error: '登录已失效，请重新登录。' };
      const current = await load();
      const user = current.users[username];
      if (!user) return { ok: false, status: 401, error: '账号不存在。' };
      const revision = Number(user.revision || 0);
      if (Number(baseRevision) !== revision) {
        return { ok: false, status: 409, error: '云端已有更新，请先下载后再上传。', revision, snapshot: user.snapshot };
      }
      if (!snapshot || typeof snapshot !== 'object' || !snapshot.state || !Array.isArray(snapshot.state.projects)) {
        return { ok: false, status: 400, error: '同步数据结构无效。' };
      }
      user.snapshot = JSON.parse(JSON.stringify(snapshot));
      user.revision = revision + 1;
      user.updatedAt = new Date().toISOString();
      await persist();
      return { ok: true, status: 200, username, revision: user.revision, updatedAt: user.updatedAt };
    },
  };
}
