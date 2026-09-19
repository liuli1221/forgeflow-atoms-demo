import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrompt } from '../src/core/parser.js';
import { generateFiles } from '../src/core/generator/index.js';
import { createVersion, appendVersion, nextVersionIndex, findVersion, restoreVersion, currentVersion, MAX_VERSIONS } from '../src/core/versions.js';
import { applyModification } from '../src/core/mutator.js';
import { createProject } from '../src/core/storage.js';

function makeVersion(prompt, index, specOverrides = {}) {
  const spec = { ...parsePrompt(prompt, { appId: 'app_v' }).spec, ...specOverrides };
  return createVersion({ spec, files: generateFiles(spec), prompt, index });
}

test('版本按序号递增并可追加', () => {
  let versions = [];
  assert.equal(nextVersionIndex(versions), 1);
  versions = appendVersion(versions, makeVersion('做一个任务清单', 1));
  assert.equal(nextVersionIndex(versions), 2);
  versions = appendVersion(versions, makeVersion('做一个任务清单', 2));
  assert.equal(versions.length, 2);
  assert.deepEqual(versions.map((v) => v.label), ['v1', 'v2']);
});

test('版本数量上限生效（滚动淘汰最早的）', () => {
  let versions = [];
  for (let i = 1; i <= MAX_VERSIONS + 5; i += 1) {
    versions = appendVersion(versions, makeVersion('做一个任务清单', i));
  }
  assert.equal(versions.length, MAX_VERSIONS);
  assert.equal(versions[versions.length - 1].index, MAX_VERSIONS + 5);
});

test('restoreVersion 把 spec/files/指针回到历史版本且不破坏历史', () => {
  const project = createProject('测试项目');
  const v1 = makeVersion('做一个任务清单', 1);
  const modified = applyModification(v1.spec, '切换暗色主题');
  const v2 = createVersion({ spec: modified.spec, files: generateFiles(modified.spec), prompt: '切换暗色主题', changes: modified.changes, mode: 'modify', index: 2 });

  project.versions = [v1, v2];
  project.spec = v2.spec;
  project.files = v2.files;
  project.currentVersionId = v2.id;

  assert.equal(project.spec.theme.mode, 'dark');

  const res = restoreVersion(project, v1.id);
  assert.equal(res.ok, true);
  assert.equal(res.project.currentVersionId, v1.id);
  assert.equal(res.project.spec.theme.mode, 'light');
  assert.equal(res.project.files['styles.css'], v1.files['styles.css']);
  assert.equal(res.project.versions.length, 2, '恢复不能删除历史版本');
  // 原对象不可变
  assert.equal(project.currentVersionId, v2.id);
});

test('restoreVersion 对不存在 / 非 READY 版本给出错误而不是抛异常', () => {
  const project = createProject('测试项目');
  project.versions = [makeVersion('做一个任务清单', 1)];

  const missing = restoreVersion(project, 'nope');
  assert.equal(missing.ok, false);
  assert.ok(missing.error.includes('找不到版本'));

  project.versions[0].status = 'FAILED';
  const notReady = restoreVersion(project, project.versions[0].id);
  assert.equal(notReady.ok, false);
  assert.ok(notReady.error.includes('READY'));

  const broken = restoreVersion({}, 'x');
  assert.equal(broken.ok, false);
});

test('currentVersion 在指针缺失时回落到最新版本', () => {
  const project = createProject('测试项目');
  const v1 = makeVersion('做一个任务清单', 1);
  const v2 = makeVersion('做一个任务清单', 2);
  project.versions = [v1, v2];
  project.currentVersionId = null;
  assert.equal(currentVersion(project).id, v2.id);
  project.currentVersionId = v1.id;
  assert.equal(currentVersion(project).id, v1.id);
  assert.equal(currentVersion(createProject('空')), null);
});

test('findVersion 返回 null 而不是 undefined', () => {
  assert.equal(findVersion([], 'x'), null);
  assert.equal(findVersion(undefined, 'x'), null);
});
