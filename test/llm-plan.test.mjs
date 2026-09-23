import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/storage.js';
import { prepareLlmRequest } from '../src/core/llm-plan.js';

test('计算器、贪吃蛇和任务 CRUD 都统一生成 DeepSeek 计划', () => {
  const project = createProject('新项目');
  for (const prompt of ['生成一个计算器', '做一个支持键盘的贪吃蛇游戏', '做一个任务管理器，支持优先级和分类筛选']) {
    const result = prepareLlmRequest(project, prompt, { available: true });
    assert.equal(result.engine, 'deepseek');
    assert.equal(result.spec.engine, 'deepseek');
    assert.equal(result.plan.summary.some((item) => item.value === 'DeepSeek LLM'), true);
  }
});

test('已有本地演示项目的修改也切到 DeepSeek，并保留 appId 与应用名', () => {
  const project = createProject('面试准备计划器');
  project.spec = { appId: 'app_seed', appName: '面试准备计划器', engine: 'local' };
  const result = prepareLlmRequest(project, '增加负责人字段', { available: true });
  assert.equal(result.engine, 'deepseek');
  assert.equal(result.mode, 'modify');
  assert.equal(result.spec.appId, 'app_seed');
  assert.equal(result.spec.appName, '面试准备计划器');
});
