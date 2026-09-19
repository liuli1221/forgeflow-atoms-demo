/**
 * Deterministic validation of generated output.
 *
 * Runs *before* a version is saved. If any check fails the run is marked
 * FAILED and the previous READY version stays untouched.
 */
import { validateSpec } from './spec-schema.js';
import { FILE_ORDER, buildPreviewDocument } from './generator/index.js';

const FORBIDDEN_JS = [
  { pattern: 'document.write', reason: '禁止使用 document.write' },
  { pattern: 'innerHTML', reason: '禁止使用 innerHTML，必须用 textContent / createElement' },
  { pattern: 'outerHTML', reason: '禁止使用 outerHTML' },
  { pattern: 'eval(', reason: '禁止使用 eval' },
  { pattern: 'new Function(', reason: '禁止在生成代码里构造函数' },
];

function check(id, label, ok, detail, level = 'fail') {
  return { id, label, status: ok ? 'pass' : level, detail: ok ? '' : detail };
}

/** Syntax-check a source string without executing it. */
export function checkSyntax(source) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(source);
    return { ok: true, message: '' };
  } catch (err) {
    // ESM-only syntax (import/export) is legal in the generated module but not
    // in a Function body — the generator emits none, so any error is real.
    return { ok: false, message: String(err && err.message) };
  }
}

/**
 * @returns {{ok:boolean, checks:Array, errors:string[]}}
 */
export function validateBundle(spec, files) {
  const checks = [];

  const specReport = validateSpec(spec);
  checks.push(check('spec', 'AppSpec schema 校验', specReport.ok, specReport.errors.map((e) => `${e.path}: ${e.message}`).join('; ')));

  const missing = FILE_ORDER.filter((name) => typeof (files || {})[name] !== 'string' || !files[name].trim());
  checks.push(check('files', '生成文件完整性 (index.html / styles.css / app.js)', missing.length === 0, `缺少文件: ${missing.join(', ')}`));

  if (missing.length === 0) {
    const html = files['index.html'];
    const css = files['styles.css'];
    const js = files['app.js'];

    checks.push(check('doctype', 'HTML 文档结构', html.startsWith('<!DOCTYPE html>') && html.includes('</html>'), 'index.html 缺少 doctype 或结束标签'));
    checks.push(check('mount', 'HTML 挂载点 (#list / #form-fields)', html.includes('id="list"') && html.includes('id="form-fields"'), '缺少必要的挂载节点'));
    checks.push(check('viewport', '移动端 viewport', html.includes('name="viewport"'), '缺少 viewport meta', 'warn'));

    const scriptCount = (html.match(/<script/g) || []).length;
    checks.push(check('script-count', 'HTML 脚本数量受控', scriptCount === 1, `期望 1 个 script 标签，实际 ${scriptCount} 个`));

    checks.push(check('css-tokens', 'CSS 主题变量', css.includes('--accent') && css.includes('--bg'), 'styles.css 缺少主题变量'));
    checks.push(check('css-responsive', 'CSS 响应式断点', css.includes('@media'), 'styles.css 缺少移动端断点', 'warn'));
    checks.push(check(
      'css-hidden',
      'hidden 属性可覆盖 display（弹层/统计/筛选可关闭）',
      /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(css),
      'styles.css 缺少 [hidden] { display: none !important }，.overlay 等类规则会压掉 hidden',
    ));

    const syntax = checkSyntax(js);
    checks.push(check('js-syntax', 'app.js 语法检查', syntax.ok, syntax.message));

    const forbidden = FORBIDDEN_JS.filter((f) => js.includes(f.pattern));
    checks.push(check('js-safety', '生成代码安全约束', forbidden.length === 0, forbidden.map((f) => f.reason).join('; ')));

    checks.push(check('js-spec', 'AppSpec 以数据形式注入', js.includes('const SPEC = {'), 'app.js 未内联 AppSpec 数据'));
    checks.push(check('js-persist', '数据持久化通道', js.includes('STORAGE_KEY') && js.includes('postMessage'), 'app.js 缺少持久化实现'));

    // The raw prompt is embedded as JSON data; make sure it cannot break out.
    const promptEscaped = !js.includes('</script') && !js.includes('<script');
    checks.push(check('js-escape', '用户文本转义（无法逃逸 script）', promptEscaped, 'app.js 中出现了未转义的标签'));

    try {
      const doc = buildPreviewDocument(files);
      checks.push(check('preview', '预览文档可组装', doc.includes('<style>') && doc.includes('<script>') && !doc.includes('src="./app.js"'), '预览文档内联失败'));
    } catch (err) {
      checks.push(check('preview', '预览文档可组装', false, String(err && err.message)));
    }
  }

  const errors = checks.filter((c) => c.status === 'fail').map((c) => `${c.label}: ${c.detail}`);
  return { ok: errors.length === 0, checks, errors };
}
