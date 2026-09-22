import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/core/storage.js';
import { prepareRequest } from '../src/core/agent.js';
import { prepareLlmRequest, shouldUseLlm } from '../src/core/llm-plan.js';

test('计算器和贪吃蛇必须走真实 LLM，不允许 generic CRUD', () => {
  const project = createProject('新项目');
  for (const prompt of ['生成一个计算器', '做一个支持键盘的贪吃蛇游戏']) {
    const local = prepareRequest(project, prompt);
    assert.equal(shouldUseLlm(project, prompt, local), true);
    const result = prepareLlmRequest(project, prompt, { available: true });
    assert.equal(result.engine, 'deepseek');
    assert.equal(result.spec.engine, 'deepseek');
    assert.equal(result.plan.summary.some((item) => item.value === 'DeepSeek LLM'), true);
  }
});

test('已命中的任务 CRUD 保留确定性本地路径', () => {
  const project = createProject('新项目');
  const prompt = '做一个任务管理器，支持优先级和分类筛选';
  const local = prepareRequest(project, prompt);
  assert.equal(shouldUseLlm(project, prompt, local), false);
});
