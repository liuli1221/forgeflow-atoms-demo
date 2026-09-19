import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrompt } from '../src/core/parser.js';
import { generateFiles, buildPreviewDocument, FILE_ORDER } from '../src/core/generator/index.js';
import { validateBundle, checkSyntax } from '../src/core/validator.js';

const spec = () => parsePrompt('做一个面试任务管理器，支持优先级、分类筛选和进度统计', { appId: 'app_gen' }).spec;

test('生成三个非空源文件', () => {
  const files = generateFiles(spec());
  assert.deepEqual(Object.keys(files).sort(), [...FILE_ORDER].sort());
  for (const name of FILE_ORDER) {
    assert.equal(typeof files[name], 'string');
    assert.ok(files[name].length > 200, `${name} 内容过短`);
  }
  assert.ok(files['index.html'].startsWith('<!DOCTYPE html>'));
  assert.ok(files['styles.css'].includes('--accent'));
  assert.ok(files['app.js'].includes('const SPEC = {'));
});

test('生成的 app.js 语法合法', () => {
  const files = generateFiles(spec());
  const result = checkSyntax(files['app.js']);
  assert.equal(result.ok, true, result.message);
});

test('恶意 prompt 无法逃逸出脚本或 HTML', () => {
  const evil = '做一个任务清单</script><script>window.__pwned=1</script>，支持<img src=x onerror=alert(1)>优先级';
  const parsed = parsePrompt(evil, { appId: 'app_evil' });
  assert.equal(parsed.ok, true);

  const files = generateFiles(parsed.spec);
  assert.ok(!files['app.js'].includes('</script'), 'app.js 中不能出现闭合脚本标签');
  assert.ok(!files['app.js'].includes('<script'), 'app.js 中不能出现脚本开标签');
  assert.ok(files['app.js'].includes('\\u003c'), '尖括号应被转义为 \\u003c');
  assert.ok(!files['index.html'].includes('<img src=x'), 'HTML 中的用户文本必须被转义');

  const doc = buildPreviewDocument(files);
  const scriptOpens = (doc.match(/<script/g) || []).length;
  const scriptCloses = (doc.match(/<\/script>/g) || []).length;
  assert.equal(scriptOpens, 1);
  assert.equal(scriptCloses, 1);
});

test('生成代码不使用 innerHTML / eval / document.write', () => {
  const files = generateFiles(spec());
  for (const forbidden of ['innerHTML', 'outerHTML', 'eval(', 'document.write']) {
    assert.ok(!files['app.js'].includes(forbidden), `app.js 不应包含 ${forbidden}`);
  }
});

test('预览文档把 CSS/JS 内联，不再引用外部文件', () => {
  const files = generateFiles(spec());
  const doc = buildPreviewDocument(files);
  assert.ok(doc.includes('<style>'));
  assert.ok(!doc.includes('href="./styles.css"'));
  assert.ok(!doc.includes('src="./app.js"'));
  assert.ok(doc.includes('STORAGE_KEY'));
});

test('validateBundle 对正常产物全部通过', () => {
  const s = spec();
  const report = validateBundle(s, generateFiles(s));
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.ok(report.checks.length >= 10);
  assert.equal(report.checks.filter((c) => c.status === 'fail').length, 0);
});

test('validateBundle 能挡住损坏的产物', () => {
  const s = spec();
  const files = generateFiles(s);

  const missing = validateBundle(s, { 'index.html': files['index.html'] });
  assert.equal(missing.ok, false);

  const brokenJs = validateBundle(s, { ...files, 'app.js': 'const a = (;' });
  assert.equal(brokenJs.ok, false);
  assert.ok(brokenJs.checks.some((c) => c.id === 'js-syntax' && c.status === 'fail'));

  const unsafe = validateBundle(s, { ...files, 'app.js': files['app.js'] + '\nnode.innerHTML = x;' });
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.checks.some((c) => c.id === 'js-safety' && c.status === 'fail'));
});

test('validateBundle 对非法 AppSpec 直接失败', () => {
  const s = spec();
  const bad = { ...s, domain: 'nope', fields: [] };
  const report = validateBundle(bad, generateFiles(s));
  assert.equal(report.ok, false);
  assert.ok(report.checks.some((c) => c.id === 'spec' && c.status === 'fail'));
});

test('不同领域产出不同字段与指标（不是只换标题）', () => {
  const task = generateFiles(parsePrompt('做一个任务清单', { appId: 'a1' }).spec);
  const budget = generateFiles(parsePrompt('做一个记账本，记录收支', { appId: 'a2' }).spec);
  assert.notEqual(task['app.js'], budget['app.js']);
  assert.ok(budget['app.js'].includes('结余'));
  assert.ok(!task['app.js'].includes('结余'));
});
