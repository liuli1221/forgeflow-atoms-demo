import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrompt, extractAppName, detectDomain, extractCustomFields } from '../src/core/parser.js';
import { validateSpec } from '../src/core/spec-schema.js';

const fixed = { appId: 'app_test', now: '2026-09-19T00:00:00.000Z' };

test('面试任务管理器 → task 领域，含优先级/分类筛选/统计', () => {
  const { ok, spec, analysis } = parsePrompt('做一个面试任务管理器，支持优先级、分类筛选和进度统计', fixed);
  assert.equal(ok, true);
  assert.equal(spec.domain, 'task');
  assert.equal(spec.appName, '面试任务管理器');
  assert.equal(analysis.flavor, 'interview');

  const keys = spec.fields.map((f) => f.key);
  assert.ok(keys.includes('title'));
  assert.ok(keys.includes('priority'), '应识别出优先级字段');
  assert.ok(keys.includes('category'));
  assert.equal(spec.layout.showStats, true);
  assert.equal(spec.layout.showFilters, true);
  assert.ok(spec.filters.some((f) => f.field === 'category'));
  assert.ok(spec.metrics.some((m) => m.key === 'done_rate'));
  // 面试语境下的分类预设
  const category = spec.fields.find((f) => f.key === 'category');
  assert.ok(category.options.includes('算法与编程'));
  assert.equal(validateSpec(spec).ok, true);
});

test('习惯打卡 → habit 领域，识别连续天数', () => {
  const { spec } = parsePrompt('帮我做一个习惯打卡应用，记录连续天数和每周目标', fixed);
  assert.equal(spec.domain, 'habit');
  const keys = spec.fields.map((f) => f.key);
  assert.ok(keys.includes('done'));
  assert.ok(keys.includes('streak'));
  assert.ok(keys.includes('target'));
  assert.equal(validateSpec(spec).ok, true);
});

test('记账 → budget 领域，含金额与结余指标', () => {
  const { spec } = parsePrompt('做一个求职开销记账本，记录收支和分类', fixed);
  assert.equal(spec.domain, 'budget');
  assert.ok(spec.fields.some((f) => f.key === 'amount'));
  assert.ok(spec.metrics.some((m) => m.type === 'delta'), '应包含结余指标');
  assert.equal(validateSpec(spec).ok, true);
});

test('反馈收集 → feedback 领域，识别评分字段', () => {
  const { spec } = parsePrompt('做一个面试反馈收集表，带评分和处理状态', fixed);
  assert.equal(spec.domain, 'feedback');
  assert.ok(spec.fields.some((f) => f.key === 'rating'));
  assert.ok(spec.metrics.some((m) => m.key === 'avg_rating'));
  assert.equal(validateSpec(spec).ok, true);
});

test('新增领域蓝图：库存 / CRM / 活动 / 图书', () => {
  const cases = [
    ['做一个库存管理系统，支持补货阈值', 'inventory', 'quantity'],
    ['做一个客户跟进 CRM，记录负责人和预计金额', 'crm', 'stage'],
    ['做一个活动管理系统，记录地点和人数上限', 'event', 'location'],
    ['做一个图书管理系统，记录 ISBN 和评分', 'library', 'author'],
  ];
  for (const [prompt, domain, requiredKey] of cases) {
    const { spec } = parsePrompt(prompt, fixed);
    assert.equal(spec.domain, domain);
    assert.ok(spec.fields.some((field) => field.key === requiredKey));
    assert.equal(validateSpec(spec).ok, true);
  }
});

test('未知领域可从显式字段生成 custom AppSpec，而不是 generic 固定 CRUD', () => {
  const prompt = '做一个宠物档案，字段包括宠物名、品种(猫,狗,其他)、出生日期、是否绝育、体重，支持搜索和统计';
  const fields = extractCustomFields(prompt);
  assert.deepEqual(fields.map((field) => field.type), ['text', 'select', 'date', 'checkbox', 'number']);
  const { spec, analysis } = parsePrompt(prompt, fixed);
  assert.equal(spec.domain, 'custom');
  assert.equal(analysis.fallback, false);
  assert.equal(spec.fields.length, 5);
  assert.equal(spec.fields[1].options.length, 3);
  assert.ok(spec.metrics.some((metric) => metric.type === 'sum'));
  assert.ok(spec.metrics.some((metric) => metric.type === 'percent'));
  assert.equal(validateSpec(spec).ok, true);
});

test('未命中领域 → generic 兜底且标记 fallback', () => {
  const { ok, spec, analysis } = parsePrompt('做一个读书笔记小工具', fixed);
  assert.equal(ok, true);
  assert.equal(spec.domain, 'generic');
  assert.equal(analysis.fallback, true);
  assert.ok(analysis.notes.join('').includes('兜底'));
  assert.equal(validateSpec(spec).ok, true);
});

test('否定句式：不需要统计 → showStats=false', () => {
  const { spec, analysis } = parsePrompt('做一个读书清单，不需要统计', fixed);
  assert.equal(spec.layout.showStats, false);
  assert.ok(analysis.removed.includes('统计'));
  assert.equal(spec.metrics.length, 1);
});

test('暗色主题与表格视图可以从描述中识别', () => {
  const { spec } = parsePrompt('做一个任务清单，用表格视图，暗色主题', fixed);
  assert.equal(spec.theme.mode, 'dark');
  assert.equal(spec.layout.view, 'table');
});

test('非法输入降级：非字符串 / 过短 / 空白', () => {
  for (const bad of [null, undefined, 42, {}, [], '', '   ', 'ab']) {
    const res = parsePrompt(bad, fixed);
    assert.equal(res.ok, false, `输入 ${JSON.stringify(bad)} 应被拒绝`);
    assert.equal(res.spec, null);
    assert.ok(res.analysis.notes.length > 0, '应给出可读的原因');
  }
});

test('超长输入被截断但不崩溃', () => {
  const long = '做一个任务管理器，' + '很多需求'.repeat(900);
  const res = parsePrompt(long, fixed);
  assert.equal(res.ok, true);
  assert.ok(res.spec.sourcePrompt.length <= 2000);
  assert.equal(validateSpec(res.spec).ok, true);
});

test('应用名抽取会去掉引导动词与尾部噪声', () => {
  assert.equal(extractAppName('帮我做一个面试任务管理器，支持优先级', 'task'), '面试任务管理器');
  assert.equal(extractAppName('搞个记账本', 'budget'), '记账本');
  assert.equal(extractAppName('创建一个习惯打卡的小网页', 'habit'), '习惯打卡');
  // 无法抽取时回落到蓝图默认名
  assert.equal(extractAppName('。', 'task'), '任务管理器');
});

test('detectDomain 在多领域词共存时取分数最高者', () => {
  const res = detectDomain('任务 任务 待办 清单 记账');
  assert.equal(res.domain, 'task');
  assert.ok(res.confidence > 0.4);
});
