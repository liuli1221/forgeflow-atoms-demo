/**
 * UI-level state container on top of core/storage.js.
 * Mutate through `update()`; every mutation persists + notifies subscribers.
 */
import { createStorage, browserBackend, memoryBackend, createProject } from '../core/storage.js';

function safeBackend() {
  try {
    const probe = '__ff_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return { backend: browserBackend(window.localStorage), persistent: true };
  } catch (err) {
    return { backend: memoryBackend(), persistent: false };
  }
}

export function createAppStore() {
  const { backend, persistent } = safeBackend();
  const storage = createStorage(backend);
  let state = storage.loadState();
  const listeners = new Set();
  let saveTimer = null;
  let lastSaveError = '';

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const res = storage.saveState(state);
    lastSaveError = res.ok ? '' : res.error;
    return res;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 120);
  }

  function notify() {
    for (const fn of listeners) {
      try { fn(state); } catch (err) { console.error('[ForgeFlow] listener error', err); }
    }
  }

  return {
    persistent,
    storage,
    getState: () => state,
    lastSaveError: () => lastSaveError,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    update(mutator, options = {}) {
      mutator(state);
      if (options.immediate) flush();
      else scheduleSave();
      if (options.silent !== true) notify();
      return state;
    },
    flush,
    activeProject() {
      return state.projects.find((p) => p.id === state.activeProjectId) || null;
    },
    getProject(id) {
      return state.projects.find((p) => p.id === id) || null;
    },
    addProject(name) {
      const project = createProject(name);
      this.update((s) => {
        s.projects.push(project);
        s.activeProjectId = project.id;
      }, { immediate: true });
      return project;
    },
    removeProject(id) {
      this.update((s) => {
        s.projects = s.projects.filter((p) => p.id !== id);
        if (s.activeProjectId === id) s.activeProjectId = s.projects.length ? s.projects[0].id : null;
      }, { immediate: true });
    },
  };
}
