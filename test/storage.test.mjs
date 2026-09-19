import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStorage, memoryBackend, createEmptyState, createProject,
  buildExportPayload, parseImport, dedupeProjectId, collectAppIds,
  STATE_KEY, APP_DATA_PREFIX,
} from '../src/core/storage.js';
import { parsePrompt } from '../src/core/parser.js';
import { generateFiles } from '../src/core/generator/index.js';
import { createVersion } from '../src/core/versions.js';

function seededProject() {
  const spec = parsePrompt('做一个面试任务管理器，支持优先级', { appId: 'app_store' }).spec;
  const files = generateFiles(spec);
  const project = createProject('面试任务管理器');
  const version = createVersion({ spec, files, prompt: 'p', index: 1 });
  project.spec = spec;
  project.files = files;
  project.versions = [version];
  project.currentVersionId = version.id;
  project.messages = [{ id: 'm1', role: 'user', text: 'hi', at: '2026-09-19T00:00:00.000Z' }];
  project.runEvents = [{ id: 'e1', stage: 'ready', status: 'done', label: '加载预览', detail: '', at: '2026-09-19T00:00:00.000Z' }];
  return project;
}

test('状态存取往返：projects / messages / versions / runEvents 全部保留', () => {
  const backend = memoryBackend();
  const storage = createStorage(backend);
  const state = createEmptyState();
  const project = seededProject();
  state.projects.push(project);
  state.activeProjectId = project.id;
  state.welcomeSeen = true;

  assert.equal(storage.saveState(state).ok, true);
  assert.ok(backend.getItem(STATE_KEY));

  const loaded = storage.loadState();
  assert.equal(loaded.welcomeSeen, true);
  assert.equal(loaded.activeProjectId, project.id);
  assert.equal(loaded.projects.length, 1);
  assert.equal(loaded.projects[0].messages.length, 1);
  assert.equal(loaded.projects[0].runEvents.length, 1);
  assert.equal(loaded.projects[0].versions[0].spec.appName, project.spec.appName);
  assert.equal(loaded.projects[0].files['app.js'], project.files['app.js']);
});

test('损坏的 JSON 降级为空状态而不是抛异常', () => {
  const backend = memoryBackend({ [STATE_KEY]: '{不是 json' });
  const storage = createStorage(backend);
  const state = storage.loadState();
  assert.deepEqual(state.projects, []);
  assert.equal(state.activeProjectId, null);
});

test('activeProjectId 指向已删除项目时会自动修正', () => {
  const backend = memoryBackend({
    [STATE_KEY]: JSON.stringify({ schemaVersion: 1, welcomeSeen: true, activeProjectId: 'gone', projects: [createProject('A')] }),
  });
  const state = createStorage(backend).loadState();
  assert.equal(state.activeProjectId, state.projects[0].id);
});

test('应用业务数据只能写入 forgeflow.appdata.* 前缀', () => {
  const storage = createStorage(memoryBackend());
  assert.equal(storage.setAppData('app_1', { items: [{ id: 'x' }] }).ok, true);
  assert.deepEqual(storage.getAppData('app_1').items, [{ id: 'x' }]);
  assert.equal(storage.setAppDataRaw('evil.key', { items: [] }).ok, false);
  assert.equal(storage.setAppDataRaw(`${APP_DATA_PREFIX}app_2`, { items: [] }).ok, true);
  assert.equal(storage.getAppData('missing'), null);
});

test('导出 / 导入往返，业务数据一起带走', () => {
  const storage = createStorage(memoryBackend());
  const project = seededProject();
  storage.setAppData(project.spec.appId, { items: [{ id: 'i1', title: '写简历' }] });

  const appIds = collectAppIds(project);
  assert.deepEqual(appIds, ['app_store']);

  const payload = buildExportPayload(project, storage.collectAppData(appIds));
  const text = JSON.stringify(payload);

  const parsed = parseImport(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.project.name, project.name);
  assert.equal(parsed.project.versions.length, 1);
  assert.equal(parsed.appData.app_store.items[0].title, '写简历');
});

test('导入非法文件给出明确原因', () => {
  assert.match(parseImport('not json').error, /JSON 解析失败/);
  assert.match(parseImport('123').error, /不是有效对象/);
  assert.match(parseImport(JSON.stringify({ kind: 'other', version: 1 })).error, /不是 ForgeFlow 导出文件/);
  assert.match(parseImport(JSON.stringify({ kind: 'forgeflow.project', version: 99 })).error, /不支持的导出版本/);
  assert.match(parseImport(JSON.stringify({ kind: 'forgeflow.project', version: 1 })).error, /缺少 project 数据/);
});

test('导入时 id 冲突会重新分配', () => {
  const project = seededProject();
  const same = dedupeProjectId(project, [project.id]);
  assert.notEqual(same.id, project.id);
  assert.ok(same.name.includes('导入'));

  const untouched = dedupeProjectId(project, ['other']);
  assert.equal(untouched.id, project.id);
});

test('clearAll 只清理 ForgeFlow 自己的 key', () => {
  const backend = memoryBackend({ 'other.app': 'keep' });
  const storage = createStorage(backend);
  storage.saveState(createEmptyState());
  storage.setAppData('app_x', { items: [] });
  storage.clearAll();
  assert.deepEqual(backend.keys(), ['other.app']);
});
