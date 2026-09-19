/**
 * Version history — pure functions, no DOM, no storage.
 *
 * Contract: a version is only ever appended after validation passed, so the
 * "current" pointer can always be restored to a known-good bundle.
 */
import { clone, uid, nowIso } from './util.js';

export const MAX_VERSIONS = 30;

export function createVersion(input) {
  const { spec, files, prompt = '', changes = [], mode = 'create', index = 1 } = input;
  return {
    id: input.id || uid('ver'),
    index,
    label: `v${index}`,
    mode,
    prompt,
    changes: [...changes],
    appName: spec.appName,
    spec: clone(spec),
    files: clone(files),
    createdAt: input.now || nowIso(),
    status: 'READY',
  };
}

export function appendVersion(versions, version) {
  const list = [...(versions || []), version];
  return list.length > MAX_VERSIONS ? list.slice(list.length - MAX_VERSIONS) : list;
}

export function nextVersionIndex(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return 1;
  return versions.reduce((max, v) => Math.max(max, Number(v.index) || 0), 0) + 1;
}

export function findVersion(versions, versionId) {
  return (versions || []).find((v) => v.id === versionId) || null;
}

/**
 * Restore a project to a previous version.
 * Non-destructive: history is preserved, only the current pointer/spec/files move.
 *
 * @returns {{ok:boolean, project:object, version:object|null, error:string}}
 */
export function restoreVersion(project, versionId) {
  if (!project || !Array.isArray(project.versions)) {
    return { ok: false, project, version: null, error: '项目数据不完整，无法恢复版本。' };
  }
  const version = findVersion(project.versions, versionId);
  if (!version) {
    return { ok: false, project, version: null, error: `找不到版本 ${String(versionId)}。` };
  }
  if (version.status !== 'READY') {
    return { ok: false, project, version: null, error: `版本 ${version.label} 不是 READY 状态，无法恢复。` };
  }
  const next = {
    ...project,
    spec: clone(version.spec),
    files: clone(version.files),
    currentVersionId: version.id,
    status: 'ready',
    updatedAt: nowIso(),
  };
  return { ok: true, project: next, version, error: '' };
}

/** Which version is currently loaded. Falls back to the newest one. */
export function currentVersion(project) {
  if (!project || !Array.isArray(project.versions) || project.versions.length === 0) return null;
  return findVersion(project.versions, project.currentVersionId) || project.versions[project.versions.length - 1];
}
