import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareRequest, executeRun, applyPlanOverrides, RUN_STAGES } from '../src/core/agent.js';
import { createProject } from '../src/core/storage.js';
import { parsePrompt } from '../src/core/parser.js';
import { generateFiles } from '../src/core/generator/index.js';
import { buildSeedProject } from '../src/core/seed.js';
import { validateSpec } from '../src/core/spec-schema.js';

const noSleep = () => Promise.resolve();

test('prepareRequest：空项目 + 有效描述 → create 计划', () => {
  const project = createProject('空项目');
  const res = prepareRequest(project, '做一个面试任务管理器，支持优先级、分类筛选和进度统计');
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'create');
  assert.equal(res.spec.domain, 'task');
  assert.ok(res.plan.steps.length >= 4);
  assert.ok(res.plan.summary.some((s) => s.label === '应用名称'));
});

test('prepareRequest：输入过短 → 拒绝并给出示例', () => {
  const res = prepareRequest(createProject('空项目'), 'ab');
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('4 个字符'));
});

test('prepareRequest：已有 spec + 修改指令 → modify 计划', () => {
  const project = createProject('p');
  project.spec = parsePrompt('做一个任务清单', { appId: 'app_a' }).spec;
  const res = prepareRequest(project, '增加优先级并切换暗色主题');
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'modify');
  assert.ok(res.changes.length >= 2);
  assert.equal(res.spec.theme.mode, 'dark');
  assert.equal(res.spec.appId, 'app_a', '增量修改必须沿用同一个 appId，业务数据才不会丢');
});

test('prepareRequest：已有 spec + 全新领域描述 → 重新生成但保留 appId', () => {
  const project = createProject('p');
  project.spec = parsePrompt('做一个任务清单', { appId: 'app_a' }).spec;
  const res = prepareRequest(project, '做一个记账本，记录收支和分类');
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'create');
  assert.equal(res.spec.domain, 'budget');
  assert.equal(res.spec.appId, 'app_a');
});

test('prepareRequest：已有 spec + 无法识别 → 失败且不产生计划', () => {
  const project = createProject('p');
  project.spec = parsePrompt('做一个任务清单', { appId: 'app_a' }).spec;
  const res = prepareRequest(project, 'zzzz');
  assert.equal(res.ok, false);
  assert.equal(res.plan, null);
});

test('applyPlanOverrides：用户在计划卡上的编辑会生效', () => {
  const spec = parsePrompt('做一个任务清单', { appId: 'app_a' }).spec;
  const next = applyPlanOverrides(spec, {
    appName: '  我的清单  ',
    view: 'table',
    themeMode: 'dark',
    showSearch: false,
    showFilters: false,
    showStats: true,
  });
  assert.equal(next.appName, '我的清单');
  assert.equal(next.layout.view, 'table');
  assert.equal(next.theme.mode, 'dark');
  assert.equal(next.layout.showSearch, false);
  assert.deepEqual(next.filters, [], '关闭筛选后必须清空 filters');
  assert.equal(validateSpec(next).ok, true);
  assert.equal(spec.appName, '任务清单', '原 spec 不可变');
});

test('executeRun：六个阶段依次 running→done 并产出 READY 版本', async () => {
  const project = createProject('p');
  const spec = parsePrompt('做一个面试任务管理器，支持优先级', { appId: 'app_run' }).spec;
  const seen = [];
  const res = await executeRun(
    { project, spec, mode: 'create', changes: [], prompt: 'x' },
    { sleep: noSleep, tick: 0, onEvent: (e) => seen.push(`${e.stage}:${e.status}`) }
  );

  assert.equal(res.ok, true);
  assert.equal(res.version.status, 'READY');
  assert.equal(res.version.label, 'v1');
  assert.ok(res.files['index.html'].length > 0);

  for (const stage of RUN_STAGES) {
    assert.ok(seen.includes(`${stage.key}:running`), `缺少 ${stage.key} running 事件`);
    assert.ok(seen.includes(`${stage.key}:done`), `缺少 ${stage.key} done 事件`);
  }
  assert.equal(seen[0], 'analyze:running');
  assert.equal(seen[seen.length - 1], 'ready:done');
});

test('executeRun：校验失败时不产生版本（当前版本得以保留）', async () => {
  const project = createProject('p');
  const spec = parsePrompt('做一个任务清单', { appId: 'app_bad' }).spec;
  spec.fields = []; // 破坏 schema

  const res = await executeRun(
    { project, spec, mode: 'create', changes: [], prompt: 'x' },
    { sleep: noSleep, tick: 0 }
  );
  assert.equal(res.ok, false);
  assert.equal(res.version, null);
  assert.ok(res.error.includes('校验未通过'));
  assert.ok(res.events.some((e) => e.stage === 'validate' && e.status === 'failed'));
});

test('executeRun：可以被取消', async () => {
  const project = createProject('p');
  const spec = parsePrompt('做一个任务清单', { appId: 'app_cancel' }).spec;
  const res = await executeRun(
    { project, spec, mode: 'create', changes: [], prompt: 'x' },
    { sleep: noSleep, tick: 0, shouldCancel: () => true }
  );
  assert.equal(res.ok, false);
  assert.equal(res.cancelled, true);
  assert.equal(res.version, null);
});

test('executeRun：版本号基于项目已有版本递增', async () => {
  const project = createProject('p');
  project.versions = [{ id: 'v_a', index: 1 }, { id: 'v_b', index: 2 }];
  const spec = parsePrompt('做一个任务清单', { appId: 'app_idx' }).spec;
  const res = await executeRun({ project, spec, mode: 'modify', changes: ['x'], prompt: 'x' }, { sleep: noSleep, tick: 0 });
  assert.equal(res.version.index, 3);
  assert.equal(res.version.label, 'v3');
  assert.equal(res.version.mode, 'modify');
});

test('预置演示项目可直接使用（跑通完整管线）', () => {
  const demo = buildSeedProject({ now: '2026-09-19T00:00:00.000Z' });
  assert.ok(demo, '预置项目必须构建成功');
  assert.equal(demo.name, '面试准备计划器');
  assert.equal(demo.status, 'ready');
  assert.equal(demo.versions.length, 1);
  assert.equal(demo.currentVersionId, demo.versions[0].id);
  assert.equal(demo.runEvents.length, RUN_STAGES.length);
  assert.ok(demo.files['index.html'].includes('面试准备计划器'));
  assert.equal(validateSpec(demo.spec).ok, true);
  assert.deepEqual(Object.keys(demo.files).sort(), ['app.js', 'index.html', 'styles.css']);
  // 生成器是确定性的：同样的 spec 产出同样的文件
  assert.equal(generateFiles(demo.spec)['styles.css'], demo.files['styles.css']);
});
