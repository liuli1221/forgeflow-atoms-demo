/**
 * Incremental AppSpec mutation ("继续改" stage).
 *
 * Takes the current AppSpec plus a follow-up instruction and produces a NEW
 * spec (never mutates the input) together with a human readable change list.
 * If nothing is recognised the caller gets ok:false and the original spec back
 * — a degraded, non-destructive outcome instead of a silent bad rewrite.
 */
import { clone, slugKey } from './util.js';
import { getBlueprint, buildMetrics } from './blueprints.js';
import { FEATURE_KEYWORDS, VIEW_KEYWORDS, THEME_KEYWORDS, NEGATORS } from './parser.js';

const ACCENTS = [
  { keys: ['蓝色', '蓝', 'blue'], value: '#4f6bed' },
  { keys: ['绿色', '绿', 'green'], value: '#1f9d6b' },
  { keys: ['红色', '红', 'red'], value: '#d64545' },
  { keys: ['紫色', '紫', 'purple'], value: '#8a5cf6' },
  { keys: ['橙色', '橙', 'orange'], value: '#c2703a' },
  { keys: ['粉色', '粉', 'pink'], value: '#d6538f' },
  { keys: ['青色', '青', 'teal', 'cyan'], value: '#2f9e9e' },
  { keys: ['灰色', '灰', 'gray', 'grey'], value: '#4a5160' },
];

const ADD_WORDS = ['增加', '添加', '新增', '加上', '加个', '加一个', '支持', '需要', '想要', '再来', '带上'];
const REMOVE_WORDS = ['去掉', '删除', '移除', '不要', '不需要', '删掉', '隐藏', '关闭'];

function hasAny(text, words) {
  return words.some((w) => text.includes(w));
}

function intentAround(text, keyword) {
  const idx = text.indexOf(keyword);
  if (idx === -1) return null;
  const before = text.slice(Math.max(0, idx - 8), idx);
  if (hasAny(before, REMOVE_WORDS)) return 'remove';
  if (hasAny(before, ADD_WORDS)) return 'add';
  return 'mention';
}

function fieldDefault(field) {
  if (field.default !== undefined) return field.default;
  if (field.type === 'checkbox') return false;
  if (field.type === 'number') return 0;
  return '';
}

function syncSeedItems(spec) {
  const keys = spec.fields.map((x) => x.key);
  spec.seedItems = (spec.seedItems || []).map((item) => {
    const next = {};
    for (const field of spec.fields) {
      next[field.key] = Object.prototype.hasOwnProperty.call(item, field.key) ? item[field.key] : fieldDefault(field);
      if (field.type === 'select' && !field.options.includes(next[field.key])) {
        next[field.key] = field.options.includes(field.default) ? field.default : field.options[0];
      }
    }
    for (const k of Object.keys(item)) if (!keys.includes(k)) delete item[k];
    return next;
  });
}

function rebuildFilters(spec) {
  const bp = getBlueprint(spec.domain);
  if (!spec.layout.showFilters) {
    spec.filters = [];
    return;
  }
  const extra = spec.filters.filter((x) => !bp.filterFields.includes(x.field));
  spec.filters = bp.filterFields
    .map((key) => spec.fields.find((x) => x.key === key))
    .filter(Boolean)
    .filter((x) => x.type === 'select')
    .map((x) => ({ key: `filter_${x.key}`, field: x.key, label: x.label }))
    .concat(extra.filter((x) => spec.fields.some((fld) => fld.key === x.field)));
}

function rebuildMetrics(spec) {
  spec.metrics = spec.layout.showStats
    ? buildMetrics(spec.domain, spec.fields)
    : [{ key: 'total', label: '总数', type: 'count', format: 'number' }];
}

/**
 * @param {object} spec current AppSpec
 * @param {string} instruction follow-up natural language instruction
 * @returns {{ok:boolean, spec:object, changes:string[], notes:string[]}}
 */
export function applyModification(spec, instruction) {
  const notes = [];
  if (!spec || typeof spec !== 'object') {
    return { ok: false, spec, changes: [], notes: ['当前项目还没有可修改的 AppSpec，请先生成一次应用。'] };
  }
  if (typeof instruction !== 'string' || instruction.trim().length < 2) {
    return { ok: false, spec, changes: [], notes: ['修改指令太短，请说明你想改什么。'] };
  }

  const next = clone(spec);
  const raw = instruction.trim();
  const text = raw.toLowerCase();
  const changes = [];
  const bp = getBlueprint(next.domain);

  // 1) rename ------------------------------------------------------------
  const renameMatch = raw.match(/(?:改名为|重命名为|名字改成|标题改成|改名叫|名称改为|rename to)\s*[:：]?\s*([^\s，,。；;]{2,24})/i);
  if (renameMatch) {
    next.appName = renameMatch[1].slice(0, 40);
    changes.push(`应用改名为「${next.appName}」`);
  }

  // 2) theme mode --------------------------------------------------------
  if (THEME_KEYWORDS.dark.some((k) => text.includes(k))) {
    if (next.theme.mode !== 'dark') changes.push('切换为暗色主题');
    next.theme.mode = 'dark';
  } else if (THEME_KEYWORDS.light.some((k) => text.includes(k))) {
    if (next.theme.mode !== 'light') changes.push('切换为亮色主题');
    next.theme.mode = 'light';
  }

  // 3) accent colour -----------------------------------------------------
  if (/主题色|主色|配色|强调色|accent/.test(text)) {
    const hit = ACCENTS.find((a) => a.keys.some((k) => text.includes(k)));
    if (hit && hit.value !== next.theme.accent) {
      next.theme.accent = hit.value;
      changes.push(`主题色调整为 ${hit.value}`);
    }
  }

  // 4) view mode ---------------------------------------------------------
  for (const [view, keywords] of Object.entries(VIEW_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) {
      if (next.layout.view !== view) {
        next.layout.view = view;
        changes.push(`视图切换为 ${view === 'table' ? '表格' : view === 'cards' ? '卡片' : '列表'}`);
      }
      break;
    }
  }

  // 5) layout toggles ----------------------------------------------------
  const toggles = [
    { flag: 'showSearch', label: '搜索', keys: ['搜索', '查找', 'search'] },
    { flag: 'showFilters', label: '筛选', keys: ['筛选', '过滤', 'filter'] },
    { flag: 'showStats', label: '统计', keys: ['统计', '完成率', '数据面板', 'dashboard', 'stats'] },
  ];
  for (const t of toggles) {
    for (const key of t.keys) {
      const intent = intentAround(text, key);
      if (!intent) continue;
      if (intent === 'remove' && next.layout[t.flag]) {
        next.layout[t.flag] = false;
        changes.push(`移除${t.label}模块`);
      } else if (intent !== 'remove' && !next.layout[t.flag]) {
        next.layout[t.flag] = true;
        changes.push(`启用${t.label}模块`);
      }
      break;
    }
  }

  // 6) known optional fields --------------------------------------------
  for (const [key, keywords] of Object.entries(FEATURE_KEYWORDS)) {
    const def = bp.optionalFields[key];
    if (!def) continue;
    for (const kw of keywords) {
      const intent = intentAround(text, kw);
      if (!intent) continue;
      const exists = next.fields.some((x) => x.key === def.key);
      if (intent === 'remove' && exists) {
        next.fields = next.fields.filter((x) => x.key !== def.key);
        changes.push(`移除字段「${def.label}」`);
      } else if (intent !== 'remove' && !exists) {
        next.fields.push(clone(def));
        changes.push(`新增字段「${def.label}」`);
      }
      break;
    }
  }

  // 7) custom field: "增加一个 公司名称 字段" ------------------------------
  const customMatch = raw.match(/(?:增加|添加|新增|加上|支持)\s*(?:一个|个)?\s*[「"']?([\u4e00-\u9fa5A-Za-z0-9_]{1,12})[」"']?\s*(?:这个)?(?:字段|列|属性)/);
  if (customMatch) {
    const label = customMatch[1];
    const key = slugKey(label, 'custom');
    if (!next.fields.some((x) => x.key === key || x.label === label)) {
      next.fields.push({ key, label, type: /日期|时间|date/.test(label) ? 'date' : /数量|金额|分数|次数|number/.test(label) ? 'number' : 'text', required: false });
      changes.push(`新增自定义字段「${label}」`);
    }
  }

  // 8) new option for an existing select: "分类增加 算法" -------------------
  const optionMatch = raw.match(/([\u4e00-\u9fa5A-Za-z]{2,6})\s*(?:里)?\s*(?:增加|添加|新增)\s*[「"']?([\u4e00-\u9fa5A-Za-z0-9]{1,10})[」"']?\s*(?:这个)?(?:选项|分类项|类别)/);
  if (optionMatch) {
    const target = next.fields.find((x) => x.type === 'select' && (x.label === optionMatch[1] || x.key === optionMatch[1]));
    if (target && !target.options.includes(optionMatch[2])) {
      target.options.push(optionMatch[2]);
      changes.push(`「${target.label}」新增选项「${optionMatch[2]}」`);
    }
  }

  if (!next.fields.some((x) => x.primary)) {
    next.fields[0] = { ...next.fields[0], primary: true };
    notes.push('主字段丢失，已自动把第一个字段设为主字段。');
  }

  rebuildFilters(next);
  rebuildMetrics(next);
  syncSeedItems(next);
  next.sourcePrompt = raw.slice(0, 2000);
  next.updatedAt = new Date().toISOString();

  if (changes.length === 0) {
    const negated = NEGATORS.some((n) => text.includes(n));
    notes.push(
      negated
        ? '没有识别出要移除的内容。可以试试「去掉备注字段」「去掉统计」。'
        : '没有识别出可执行的修改。可以试试「增加优先级」「切换暗色主题」「改成表格视图」「改名为 XXX」。'
    );
    return { ok: false, spec, changes: [], notes };
  }

  return { ok: true, spec: next, changes, notes };
}
