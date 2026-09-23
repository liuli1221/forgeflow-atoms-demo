import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGeneratedBundle } from '../server/llm-validator.mjs';
import { makeArtifactFixture as artifact } from './fixtures/llm-artifacts.mjs';

test('计算器生成包通过文件、安全与专项契约校验', () => {
  const report = validateGeneratedBundle('生成一个计算器', artifact('calculator'));
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.ok(report.checks.some((item) => item.id === 'calculator-contract' && item.status === 'pass'));
});

test('贪吃蛇生成包要求 Canvas、键盘事件和游戏循环', () => {
  const report = validateGeneratedBundle('生成一个贪吃蛇游戏', artifact('snake'));
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.ok(report.checks.some((item) => item.id === 'snake-loop' && item.status === 'pass'));
});

test('危险 API 与伪装成 CRUD 的计算器会被拦截', () => {
  const bad = artifact('calculator');
  bad.files['index.html'] = bad.files['index.html'].replace('data-testid="calculator-display"', '');
  bad.files['index.html'] = bad.files['index.html'].replace('</main>', '<p>Powered by DeepSeek</p></main>');
  bad.files['app.js'] = bad.files['app.js'].replace('data-testid="calculator-display"', 'data-testid="calculator-output"');
  bad.files['app.js'] += `\nfetch('https://example.com'); document.body.innerHTML='bad';`;
  const report = validateGeneratedBundle('生成一个计算器', bad);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /计算器交互契约/);
  assert.match(report.errors.join('\n'), /JavaScript 安全约束/);
  assert.match(report.errors.join('\n'), /生成应用不暴露底层模型/);
});

test('任务管理应用必须具备标准交互和 ForgeFlow 持久化桥', () => {
  const appId = 'app_crud_contract';
  const good = artifact('crud', { appId });
  const report = validateGeneratedBundle('做一个任务管理器，支持增删改查和搜索', good, { appId });
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.ok(report.checks.some((item) => item.id === 'crud-contract' && item.status === 'pass'));
  assert.ok(report.checks.some((item) => item.id === 'persistence-bridge' && item.status === 'pass'));

  const bad = artifact('crud', { appId });
  bad.files['app.js'] = bad.files['app.js'].replace(`forgeflow.appdata.`, 'wrong-prefix.');
  const rejected = validateGeneratedBundle('做一个任务管理器', bad, { appId });
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join('\n'), /业务数据持久化契约/);

  const hiddenSave = artifact('crud', { appId });
  hiddenSave.files['index.html'] = hiddenSave.files['index.html'].replace('data-testid="item-save"', 'data-testid="item-save" class="hidden"');
  const hiddenReport = validateGeneratedBundle('做一个任务管理器', hiddenSave, { appId });
  assert.equal(hiddenReport.ok, false);
  assert.match(hiddenReport.errors.join('\n'), /关键控件不能静态隐藏: item-save/);
});
