import { checkSyntax } from '../src/core/validator.js';

export const GENERATED_FILES = ['index.html', 'styles.css', 'app.js'];

const FORBIDDEN_JS = [
  ['innerHTML', '禁止使用 innerHTML'],
  ['outerHTML', '禁止使用 outerHTML'],
  ['document.write', '禁止使用 document.write'],
  ['eval(', '禁止使用 eval'],
  ['new Function(', '禁止动态构造函数'],
  ['fetch(', '生成应用禁止主动发起网络请求'],
  ['XMLHttpRequest', '生成应用禁止主动发起网络请求'],
  ['WebSocket', '生成应用禁止建立网络连接'],
  ['EventSource', '生成应用禁止建立网络连接'],
  ['localStorage', 'sandbox 应用禁止直接访问 localStorage'],
  ['sessionStorage', 'sandbox 应用禁止直接访问 sessionStorage'],
];

function result(id, label, ok, detail = '', level = 'fail') {
  return { id, label, status: ok ? 'pass' : level, detail: ok ? '' : detail };
}

function semanticChecks(prompt, html, js) {
  const checks = [];
  const text = String(prompt || '').toLowerCase();
  const combined = `${html}\n${js}`;
  if (/计算器|calculator/.test(text)) {
    const required = ['calculator-display', 'key-7', 'key-add', 'key-5', 'key-equals', 'key-clear'];
    const missing = required.filter((id) => !combined.includes(`data-testid="${id}"`) && !combined.includes(`data-testid='${id}'`));
    checks.push(result('calculator-contract', '计算器交互契约', missing.length === 0, `缺少测试标识: ${missing.join(', ')}`));
  }
  if (/贪吃蛇|snake/.test(text)) {
    const required = ['snake-canvas', 'snake-score', 'snake-start', 'snake-status'];
    const missing = required.filter((id) => !combined.includes(`data-testid="${id}"`) && !combined.includes(`data-testid='${id}'`));
    checks.push(result('snake-contract', '贪吃蛇交互契约', missing.length === 0, `缺少测试标识: ${missing.join(', ')}`));
    checks.push(result('snake-keyboard', '贪吃蛇键盘控制', /keydown|keyup/.test(js) && /Arrow(?:Up|Down|Left|Right)/.test(js), '缺少方向键事件处理'));
    checks.push(result('snake-loop', '贪吃蛇游戏循环', /requestAnimationFrame|setInterval|setTimeout/.test(js), '缺少游戏循环'));
    checks.push(result('snake-running-state', '贪吃蛇启动状态', /["']running["']/.test(js), '开始后必须把 snake-status 更新为 running'));
  }
  return checks;
}

export function validateGeneratedBundle(prompt, artifact) {
  const files = artifact && artifact.files;
  const checks = [];
  const missing = GENERATED_FILES.filter((name) => typeof (files || {})[name] !== 'string' || !files[name].trim());
  checks.push(result('files', '生成文件完整性', missing.length === 0, `缺少文件: ${missing.join(', ')}`));

  if (!missing.length) {
    const html = files['index.html'];
    const css = files['styles.css'];
    const js = files['app.js'];
    checks.push(result('html-document', 'HTML 文档结构', /^<!doctype html>/i.test(html) && /<\/html>/i.test(html), '需要完整 HTML 文档'));
    checks.push(result('html-viewport', '移动端 viewport', /name=["']viewport["']/i.test(html), '缺少 viewport meta', 'warn'));
    checks.push(result('html-root', '应用根节点', /data-testid=["']app-root["']/.test(html), '缺少 data-testid="app-root"'));
    checks.push(result('html-assets', '本地三文件引用', html.includes('<link rel="stylesheet" href="./styles.css" />') && html.includes('<script type="module" src="./app.js"></script>'), '必须使用 ForgeFlow 的固定 CSS/JS 引用'));
    checks.push(result('html-script-count', '脚本数量受控', (html.match(/<script\b/gi) || []).length === 1, 'index.html 只能包含一个 app.js script 标签'));
    const unsafeHtml = /\son[a-z]+\s*=|<\s*(?:iframe|object|embed)\b|https?:\/\//i.test(html);
    checks.push(result('html-safety', 'HTML 安全约束', !unsafeHtml, '禁止内联事件、嵌套执行容器和外部 URL'));
    checks.push(result('css-content', 'CSS 非空且具备响应式布局', css.length > 200 && /@media/.test(css), 'styles.css 过短或缺少响应式断点', 'warn'));
    const syntax = checkSyntax(js);
    checks.push(result('js-syntax', 'JavaScript 语法', syntax.ok, syntax.message));
    const forbidden = FORBIDDEN_JS.filter(([token]) => js.includes(token));
    checks.push(result('js-safety', 'JavaScript 安全约束', forbidden.length === 0, forbidden.map(([, reason]) => reason).join('；')));
    checks.push(result('script-escape', '脚本标签不可逃逸', !/<\/?script/i.test(js), 'app.js 中出现 script 标签文本'));
    checks.push(...semanticChecks(prompt, html, js));
    const total = GENERATED_FILES.reduce((sum, name) => sum + files[name].length, 0);
    checks.push(result('bundle-size', '生成包体积', total <= 400_000, `生成文件总计 ${total} 字符，超过 400000`));
  }

  const errors = checks.filter((item) => item.status === 'fail').map((item) => `${item.label}: ${item.detail}`);
  return { ok: errors.length === 0, checks, errors };
}
