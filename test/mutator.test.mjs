import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrompt } from '../src/core/parser.js';
import { applyModification } from '../src/core/mutator.js';
import { validateSpec } from '../src/core/spec-schema.js';

const base = () => parsePrompt('做一个面试任务管理器，支持分类筛选和进度统计', { appId: 'app_test' }).spec;

test('增加优先级：新增字段并派生出高优先级指标', () => {
  const before = base();
  assert.equal(before.fields.some((f) => f.key === 'priority'), false);

  const res = applyModification(before, '增加优先级');
  assert.equal(res.ok, true);
  assert.ok(res.changes.join('').includes('优先级'));
  assert.equal(res.spec.fields.some((f) => f.key === 'priority'), true);
  assert.ok(res.spec.metrics.some((m) => m.key === 'high_priority'));
  assert.ok(res.spec.filters.some((f) => f.field === 'priority'));
  assert.equal(validateSpec(res.spec).ok, true);
  // 不可变：原 spec 未被修改
  assert.equal(before.fields.some((f) => f.key === 'priority'), false);
});

test('新增字段后示例数据补齐默认值', () => {
  const res = applyModification(base(), '增加优先级');
  for (const item of res.spec.seedItems) {
    assert.ok(Object.prototype.hasOwnProperty.call(item, 'priority'));
    assert.ok(['高', '中', '低'].includes(item.priority));
  }
});

test('切换暗色主题 / 亮色主题', () => {
  const dark = applyModification(base(), '切换暗色主题');
  assert.equal(dark.ok, true);
  assert.equal(dark.spec.theme.mode, 'dark');

  const light = applyModification(dark.spec, '改回浅色主题');
  assert.equal(light.ok, true);
  assert.equal(light.spec.theme.mode, 'light');
});

test('切换卡片 / 表格视图', () => {
  const table = applyModification(base(), '改成表格视图');
  assert.equal(table.spec.layout.view, 'table');
  const cards = applyModification(table.spec, '换成卡片视图');
  assert.equal(cards.spec.layout.view, 'cards');
});

test('改名与主题色', () => {
  const renamed = applyModification(base(), '改名为 面试冲刺看板');
  assert.equal(renamed.spec.appName, '面试冲刺看板');

  const colored = applyModification(base(), '主题色改成绿色');
  assert.equal(colored.spec.theme.accent, '#1f9d6b');
});

test('移除字段与移除统计模块', () => {
  const removed = applyModification(base(), '去掉备注');
  assert.equal(removed.spec.fields.some((f) => f.key === 'notes'), false);
  for (const item of removed.spec.seedItems) {
    assert.equal(Object.prototype.hasOwnProperty.call(item, 'notes'), false);
  }

  const noStats = applyModification(base(), '去掉统计');
  assert.equal(noStats.spec.layout.showStats, false);
  assert.equal(noStats.spec.metrics.length, 1);
});

test('自定义字段与新增下拉选项', () => {
  const custom = applyModification(base(), '增加一个公司名称字段');
  assert.equal(custom.ok, true);
  assert.ok(custom.spec.fields.some((f) => f.label === '公司名称'));
  assert.equal(validateSpec(custom.spec).ok, true);

  const option = applyModification(base(), '分类增加 系统设计 选项');
  const category = option.spec.fields.find((f) => f.key === 'category');
  assert.ok(category.options.includes('系统设计'));
});

test('无法识别的指令：不修改任何东西并给出提示', () => {
  const before = base();
  const res = applyModification(before, 'asdkjhasd');
  assert.equal(res.ok, false);
  assert.equal(res.changes.length, 0);
  assert.equal(res.spec, before, '失败时必须原样返回旧 spec');
  assert.ok(res.notes[0].includes('没有识别'));
});

test('非法输入：空 spec / 过短指令', () => {
  assert.equal(applyModification(null, '增加优先级').ok, false);
  assert.equal(applyModification(base(), '').ok, false);
  assert.equal(applyModification(base(), 'a').ok, false);
});

test('连续多轮修改可以叠加', () => {
  let spec = base();
  for (const instruction of ['增加优先级', '切换暗色主题', '改成表格视图', '增加负责人字段']) {
    const res = applyModification(spec, instruction);
    assert.equal(res.ok, true, instruction);
    spec = res.spec;
  }
  assert.equal(spec.theme.mode, 'dark');
  assert.equal(spec.layout.view, 'table');
  assert.ok(spec.fields.some((f) => f.key === 'priority'));
  assert.ok(spec.fields.some((f) => f.key === 'owner'));
  assert.equal(validateSpec(spec).ok, true);
});
