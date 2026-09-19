/**
 * hidden 属性的可见性回归测试。
 *
 * 背景（P0 bug）：`dom.overlay.hidden = true` 之后 computed display 仍然是 flex，
 * 表单弹层（#form-fields 所在的 .overlay）永久盖在生成应用上面。
 * 根因不是 JS，而是 CSS 级联：UA 样式表的 `[hidden] { display: none }` 特异性只有
 * (0,1,0)，任何显式声明 display 的类规则都会赢，比如 `.overlay { display: flex }`。
 *
 * 这里实现一个最小 CSS 级联求解器（!important > 特异性 > 源码顺序），对
 * 「所有会被 hidden 切换的元素」求解 display，必须是 none。
 * 这样以后有人给 .toast / .empty 之类补上 display 也不会静默把 bug 带回来。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parsePrompt } from '../src/core/parser.js';
import { generateFiles } from '../src/core/generator/index.js';
import { validateBundle } from '../src/core/validator.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ------------------------------------------------------------ CSS 级联求解 */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 去掉 @media 等 at-rule 块（本测试只关心无条件的基础级联）。 */
function stripAtRuleBlocks(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@', i);
    if (at === -1) return out + css.slice(i);
    const open = css.indexOf('{', at);
    if (open === -1) return out + css.slice(i, at);
    out += css.slice(i, at);
    let depth = 0;
    let j = open;
    for (; j < css.length; j += 1) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = j + 1;
  }
  return out;
}

/** 解析出 [{ selector, display, important, order }]，只保留声明了 display 的规则。 */
function parseDisplayRules(css) {
  const rules = [];
  const body = stripAtRuleBlocks(stripComments(css));
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  let order = 0;
  while ((m = re.exec(body))) {
    const selectors = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const decls = m[2].split(';').map((d) => d.trim()).filter(Boolean);
    let display = null;
    let important = false;
    for (const decl of decls) {
      const idx = decl.indexOf(':');
      if (idx === -1) continue;
      if (decl.slice(0, idx).trim().toLowerCase() !== 'display') continue;
      const value = decl.slice(idx + 1).trim();
      important = /!\s*important$/i.test(value);
      display = value.replace(/!\s*important$/i, '').trim().toLowerCase();
    }
    if (display) {
      for (const selector of selectors) {
        order += 1;
        rules.push({ selector, display, important, order });
      }
    }
  }
  return rules;
}

function specificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) || []).length;
  const classish = (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) || []).length;
  const tags = (selector.replace(/[#.[:][^\s>+~]*/g, ' ').match(/[a-z][\w-]*/gi) || []).length;
  return ids * 100 + classish * 10 + tags;
}

/** 只支持本项目实际用到的简单选择器；带组合器时仅用最后一段做保守匹配。 */
function matchesCompound(compound, el) {
  const tag = (compound.match(/^[a-z][\w-]*/i) || [])[0];
  if (tag && tag.toLowerCase() !== el.tag) return false;
  for (const id of compound.match(/#[\w-]+/g) || []) {
    if (id.slice(1) !== el.id) return false;
  }
  for (const cls of compound.match(/\.[\w-]+/g) || []) {
    if (!el.classes.includes(cls.slice(1))) return false;
  }
  for (const attr of compound.match(/\[[^\]]+\]/g) || []) {
    if (attr.slice(1, -1).trim() !== 'hidden') return false;
    if (!el.hidden) return false;
  }
  if (compound === '*') return true;
  return true;
}

function matches(selector, el) {
  const compounds = selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  const last = compounds[compounds.length - 1];
  return matchesCompound(last, el);
}

/**
 * 求解元素在 hidden=true 时的 computed display。
 * UA 样式表以 `[hidden] { display: none }`（特异性 10，顺序最前）参与级联。
 */
function computedDisplayWhenHidden(css, el) {
  const element = { tag: 'div', id: '', classes: [], ...el, hidden: true };
  const candidates = [
    { selector: '[hidden]', display: 'none', important: false, order: 0, ua: true },
    ...parseDisplayRules(css),
  ].filter((rule) => matches(rule.selector, element));

  candidates.sort((a, b) => {
    if (a.important !== b.important) return a.important ? -1 : 1;
    const sa = specificity(a.selector);
    const sb = specificity(b.selector);
    if (sa !== sb) return sb - sa;
    return b.order - a.order;
  });
  return candidates.length ? candidates[0].display : 'inline';
}

/** 从 HTML 里抽出所有带 hidden 属性的元素。 */
function hiddenElementsOf(html) {
  const out = [];
  const re = /<([a-z][\w-]*)\s([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2];
    if (!/(^|\s)hidden(\s|=|\/|$)/i.test(attrs)) continue;
    out.push({
      tag: m[1].toLowerCase(),
      id: (attrs.match(/id="([^"]+)"/) || [])[1] || '',
      classes: ((attrs.match(/class="([^"]+)"/) || [])[1] || '').split(/\s+/).filter(Boolean),
    });
  }
  return out;
}

/* ------------------------------------------------------- 求解器自检（元测试） */

test('级联求解器能复现这个 bug：类规则的 display 会压掉 [hidden]', () => {
  const css = '.overlay { position: fixed; display: flex; }';
  assert.equal(computedDisplayWhenHidden(css, { classes: ['overlay'] }), 'flex');

  const fixed = '[hidden] { display: none !important; }\n' + css;
  assert.equal(computedDisplayWhenHidden(fixed, { classes: ['overlay'] }), 'none');

  // 没有 display 声明的类规则本来就不受影响
  assert.equal(computedDisplayWhenHidden('.toast { position: fixed; }', { classes: ['toast'] }), 'none');
});

/* ------------------------------------------------- 生成应用（core/generator） */

const makeSpec = (overrides = {}) => {
  const base = parsePrompt('做一个面试任务管理器，支持优先级、分类筛选和进度统计', { appId: 'app_hidden' }).spec;
  return { ...base, ...overrides, layout: { ...base.layout, ...(overrides.layout || {}) } };
};

test('生成的 styles.css 带 [hidden] 全局兜底', () => {
  const css = generateFiles(makeSpec())['styles.css'];
  assert.match(css, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
});

test('P0：#overlay 在 hidden=true 时 computed display 必须是 none', () => {
  const css = generateFiles(makeSpec())['styles.css'];
  assert.equal(computedDisplayWhenHidden(css, { id: 'overlay', classes: ['overlay'] }), 'none');
});

test('生成 HTML 里所有 hidden 元素都真的不可见（含 toast / empty / form-error）', () => {
  // 三个布局开关全关，让 #stats / .search-box / #filters 都带上 hidden
  const files = generateFiles(makeSpec({ layout: { showStats: false, showSearch: false, showFilters: false } }));
  const els = hiddenElementsOf(files['index.html']);

  const ids = els.map((e) => e.id || e.classes.join('.')).sort();
  assert.deepEqual(ids, ['empty', 'filters', 'form-error', 'overlay', 'search-box', 'stats', 'toast']);

  for (const el of els) {
    const display = computedDisplayWhenHidden(files['styles.css'], el);
    assert.equal(display, 'none', `#${el.id || el.classes.join('.')} 在 hidden 时 display=${display}`);
  }
});

test('JS 运行时切换的元素（overlay / toast / empty / form-error）同样可隐藏', () => {
  const files = generateFiles(makeSpec());
  const js = files['app.js'];
  // 先确认运行时确实是靠 hidden 属性控制的
  for (const line of ['dom.overlay.hidden', 'dom.toast.hidden', 'dom.empty.hidden', 'dom.formError.hidden']) {
    assert.ok(js.includes(line), `app.js 应通过 ${line} 控制显隐`);
  }
  const toggled = [
    { id: 'overlay', classes: ['overlay'] },
    { id: 'toast', classes: ['toast'] },
    { id: 'empty', classes: ['empty'], tag: 'p' },
    { id: 'form-error', classes: ['form-error'], tag: 'p' },
  ];
  for (const el of toggled) {
    assert.equal(computedDisplayWhenHidden(files['styles.css'], el), 'none', `#${el.id} 无法隐藏`);
  }
});

test('validateBundle 会拦住丢掉 [hidden] 兜底的 CSS', () => {
  const spec = makeSpec();
  const files = generateFiles(spec);
  assert.ok(validateBundle(spec, files).checks.some((c) => c.id === 'css-hidden' && c.status === 'pass'));

  const stripped = files['styles.css'].replace(/\[hidden\]\s*\{[^}]*!important[^}]*\}/, '');
  assert.ok(stripped !== files['styles.css'], '兜底规则应被移除，否则这条断言没意义');
  const report = validateBundle(spec, { ...files, 'styles.css': stripped });
  assert.equal(report.ok, false);
  assert.ok(report.checks.some((c) => c.id === 'css-hidden' && c.status === 'fail'));
});

/* ---------------------------------------------------- Builder 自身的静态资源 */

const BUILDER_CSS = ['src/styles/base.css', 'src/styles/workbench.css', 'src/styles/responsive.css']
  .map(read)
  .join('\n');

test('Builder base.css 带 [hidden] 全局兜底', () => {
  assert.match(read('src/styles/base.css'), /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
});

test('index.html 里所有 hidden 元素都真的不可见（#welcome / #workbench）', () => {
  const els = hiddenElementsOf(read('index.html'));
  const ids = els.map((e) => e.id).sort();
  assert.deepEqual(ids, ['import-file', 'welcome', 'workbench']);

  for (const el of els) {
    const display = computedDisplayWhenHidden(BUILDER_CSS, el);
    assert.equal(display, 'none', `#${el.id} 在 hidden 时 display=${display}`);
  }
});

test('Builder 运行时切换的 .preview-empty 仍可隐藏（兜底替代了逐个补丁）', () => {
  assert.equal(computedDisplayWhenHidden(BUILDER_CSS, { classes: ['preview-empty'] }), 'none');
});
