/**
 * Persistence layer.
 *
 * Everything the builder knows (projects, messages, AppSpec, run events,
 * versions, generated files) lives under one localStorage key; the *business*
 * data produced inside each generated app lives under its own key so it can be
 * exported / cleared independently.
 *
 * The backend is injectable, which is what makes this file unit-testable under
 * `node --test` (no window, no localStorage).
 */
import { uid, nowIso, clone } from './util.js';

export const STATE_KEY = 'forgeflow.v1.state';
export const APP_DATA_PREFIX = 'forgeflow.appdata.';
export const EXPORT_KIND = 'forgeflow.project';
export const EXPORT_VERSION = 1;

export function createEmptyState() {
  return { schemaVersion: 1, welcomeSeen: false, activeProjectId: null, projects: [] };
}

export function createProject(name, options = {}) {
  return {
    id: options.id || uid('prj'),
    name: String(name || '未命名项目').slice(0, 40),
    createdAt: options.now || nowIso(),
    updatedAt: options.now || nowIso(),
    messages: [],
    spec: null,
    files: null,
    analysis: null,
    pendingPlan: null,
    status: 'idle',
    currentVersionId: null,
    versions: [],
    runEvents: [],
  };
}

/** In-memory backend used by tests (and as a fallback when storage is blocked). */
export function memoryBackend(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

/** Wrap window.localStorage into the same shape (keys() included). */
export function browserBackend(storage) {
  return {
    getItem: (k) => storage.getItem(k),
    setItem: (k, v) => storage.setItem(k, v),
    removeItem: (k) => storage.removeItem(k),
    keys: () => {
      const out = [];
      for (let i = 0; i < storage.length; i += 1) out.push(storage.key(i));
      return out;
    },
  };
}

function migrate(raw) {
  if (!raw || typeof raw !== 'object') return createEmptyState();
  const state = { ...createEmptyState(), ...raw };
  state.projects = Array.isArray(raw.projects) ? raw.projects : [];
  state.projects = state.projects.map((p) => ({ ...createProject(p.name, { id: p.id, now: p.createdAt }), ...p }));
  if (!state.projects.some((p) => p.id === state.activeProjectId)) {
    state.activeProjectId = state.projects.length ? state.projects[0].id : null;
  }
  return state;
}

export function createStorage(backend) {
  return {
    loadState() {
      try {
        const raw = backend.getItem(STATE_KEY);
        if (!raw) return createEmptyState();
        return migrate(JSON.parse(raw));
      } catch (err) {
        return createEmptyState();
      }
    },

    saveState(state) {
      try {
        backend.setItem(STATE_KEY, JSON.stringify(state));
        return { ok: true, error: '' };
      } catch (err) {
        return { ok: false, error: String(err && err.message) };
      }
    },

    getAppData(appId) {
      try {
        const raw = backend.getItem(APP_DATA_PREFIX + appId);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        return null;
      }
    },

    setAppDataRaw(key, data) {
      if (typeof key !== 'string' || key.indexOf(APP_DATA_PREFIX) !== 0) return { ok: false, error: '非法存储 key' };
      try {
        backend.setItem(key, JSON.stringify(data));
        return { ok: true, error: '' };
      } catch (err) {
        return { ok: false, error: String(err && err.message) };
      }
    },

    setAppData(appId, data) {
      return this.setAppDataRaw(APP_DATA_PREFIX + appId, data);
    },

    collectAppData(appIds) {
      const out = {};
      for (const appId of appIds) {
        const value = this.getAppData(appId);
        if (value) out[appId] = value;
      }
      return out;
    },

    clearAll() {
      backend.keys()
        .filter((k) => k === STATE_KEY || k.indexOf(APP_DATA_PREFIX) === 0)
        .forEach((k) => backend.removeItem(k));
    },
  };
}

/* ------------------------------------------------------------ import/export */

export function collectAppIds(project) {
  const ids = new Set();
  if (project && project.spec && project.spec.appId) ids.add(project.spec.appId);
  for (const v of (project && project.versions) || []) {
    if (v && v.spec && v.spec.appId) ids.add(v.spec.appId);
  }
  return [...ids];
}

export function buildExportPayload(project, appData) {
  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: nowIso(),
    generator: 'ForgeFlow DeepSeek Agent',
    project: clone(project),
    appData: clone(appData || {}),
  };
}

/**
 * Parse + validate an exported project file.
 * @returns {{ok:boolean, project:object|null, appData:object, error:string}}
 */
export function parseImport(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    return { ok: false, project: null, appData: {}, error: 'JSON 解析失败：' + String(err && err.message) };
  }
  if (!payload || typeof payload !== 'object') {
    return { ok: false, project: null, appData: {}, error: '导入内容不是有效对象。' };
  }
  if (payload.kind !== EXPORT_KIND) {
    return { ok: false, project: null, appData: {}, error: `不是 ForgeFlow 导出文件（kind=${String(payload.kind)}）。` };
  }
  if (Number(payload.version) !== EXPORT_VERSION) {
    return { ok: false, project: null, appData: {}, error: `不支持的导出版本：${String(payload.version)}。` };
  }
  const p = payload.project;
  if (!p || typeof p !== 'object' || !p.name) {
    return { ok: false, project: null, appData: {}, error: '导出文件缺少 project 数据。' };
  }
  const project = {
    ...createProject(p.name, { id: p.id, now: p.createdAt }),
    ...p,
    versions: Array.isArray(p.versions) ? p.versions : [],
    messages: Array.isArray(p.messages) ? p.messages : [],
    runEvents: Array.isArray(p.runEvents) ? p.runEvents : [],
  };
  return { ok: true, project, appData: payload.appData && typeof payload.appData === 'object' ? payload.appData : {}, error: '' };
}

/** Give an imported project a fresh id when it collides with an existing one. */
export function dedupeProjectId(project, existingIds) {
  if (!existingIds.includes(project.id)) return project;
  return { ...project, id: uid('prj'), name: `${project.name}（导入）`.slice(0, 40) };
}
