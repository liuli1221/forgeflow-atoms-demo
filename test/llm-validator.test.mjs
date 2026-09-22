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
  bad.files['app.js'] = bad.files['app.js'].replace('data-testid="calculator-display"', 'data-testid="calculator-output"');
  bad.files['app.js'] += `\nfetch('https://example.com'); document.body.innerHTML='bad';`;
  const report = validateGeneratedBundle('生成一个计算器', bad);
  assert.equal(report.ok, false);
  assert.match(report.errors.join('\n'), /计算器交互契约/);
  assert.match(report.errors.join('\n'), /JavaScript 安全约束/);
});
