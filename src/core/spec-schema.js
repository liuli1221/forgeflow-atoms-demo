/**
 * AppSpec schema + validator.
 *
 * The AppSpec is the single contract between:
 *   prompt parser  ->  AppSpec  ->  code generator
 * Nothing downstream is allowed to read raw user text.
 */

export const SPEC_VERSION = 1;

export const DOMAINS = [
  'task', 'habit', 'budget', 'feedback',
  'inventory', 'crm', 'event', 'library',
  'custom', 'generic',
];
export const FIELD_TYPES = ['text', 'textarea', 'select', 'number', 'date', 'checkbox'];
export const VIEW_MODES = ['cards', 'table', 'list'];
export const THEME_MODES = ['light', 'dark'];
export const METRIC_TYPES = ['count', 'sum', 'avg', 'percent', 'delta'];
export const METRIC_FORMATS = ['number', 'currency', 'percent'];

const KEY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function err(list, path, message) {
  list.push({ path, message });
}

/**
 * Validate an AppSpec. Returns { ok, errors: [{path, message}], warnings: [] }.
 * Pure: never throws for bad input, always returns a report.
 */
export function validateSpec(spec) {
  const errors = [];
  const warnings = [];

  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, errors: [{ path: '$', message: 'AppSpec 必须是一个对象' }], warnings };
  }

  if (spec.specVersion !== SPEC_VERSION) {
    err(errors, 'specVersion', `specVersion 必须等于 ${SPEC_VERSION}`);
  }
  if (typeof spec.appId !== 'string' || !spec.appId.trim()) {
    err(errors, 'appId', 'appId 不能为空');
  }
  if (typeof spec.appName !== 'string' || !spec.appName.trim()) {
    err(errors, 'appName', '应用名称不能为空');
  } else if (spec.appName.length > 40) {
    err(errors, 'appName', '应用名称不能超过 40 个字符');
  }
  if (typeof spec.tagline !== 'string') err(errors, 'tagline', 'tagline 必须是字符串');
  if (!DOMAINS.includes(spec.domain)) {
    err(errors, 'domain', `domain 必须是 ${DOMAINS.join(' / ')} 之一`);
  }
  if (typeof spec.entityName !== 'string' || !spec.entityName.trim()) {
    err(errors, 'entityName', 'entityName 不能为空');
  }

  // theme
  const theme = spec.theme;
  if (!theme || typeof theme !== 'object') {
    err(errors, 'theme', 'theme 缺失');
  } else {
    if (!THEME_MODES.includes(theme.mode)) err(errors, 'theme.mode', 'theme.mode 必须是 light 或 dark');
    if (!HEX_RE.test(String(theme.accent))) err(errors, 'theme.accent', 'theme.accent 必须是 #rrggbb');
  }

  // layout
  const layout = spec.layout;
  if (!layout || typeof layout !== 'object') {
    err(errors, 'layout', 'layout 缺失');
  } else {
    if (!VIEW_MODES.includes(layout.view)) err(errors, 'layout.view', `layout.view 必须是 ${VIEW_MODES.join(' / ')}`);
    for (const flag of ['showSearch', 'showStats', 'showFilters']) {
      if (typeof layout[flag] !== 'boolean') err(errors, `layout.${flag}`, `layout.${flag} 必须是布尔值`);
    }
  }

  // fields
  if (!Array.isArray(spec.fields) || spec.fields.length === 0) {
    err(errors, 'fields', '至少需要一个字段');
  } else {
    const seen = new Set();
    let hasPrimary = false;
    spec.fields.forEach((f, i) => {
      const p = `fields[${i}]`;
      if (!f || typeof f !== 'object') return err(errors, p, '字段必须是对象');
      if (!KEY_RE.test(String(f.key))) err(errors, `${p}.key`, `非法字段 key: ${String(f.key)}`);
      if (seen.has(f.key)) err(errors, `${p}.key`, `字段 key 重复: ${f.key}`);
      seen.add(f.key);
      if (typeof f.label !== 'string' || !f.label.trim()) err(errors, `${p}.label`, '字段 label 不能为空');
      if (!FIELD_TYPES.includes(f.type)) err(errors, `${p}.type`, `未知字段类型: ${String(f.type)}`);
      if (f.type === 'select') {
        if (!Array.isArray(f.options) || f.options.length === 0) {
          err(errors, `${p}.options`, 'select 字段必须提供 options');
        } else if (f.options.some((o) => typeof o !== 'string' || !o.trim())) {
          err(errors, `${p}.options`, 'select options 必须都是非空字符串');
        }
      }
      if (f.primary) hasPrimary = true;
    });
    if (!hasPrimary) err(errors, 'fields', '必须有且至少一个 primary 字段（用于列表标题）');
    if (spec.fields.length > 12) warnings.push({ path: 'fields', message: '字段超过 12 个，表单会比较长' });
  }

  const fieldKeys = new Set((Array.isArray(spec.fields) ? spec.fields : []).map((f) => f && f.key));

  // filters
  if (!Array.isArray(spec.filters)) {
    err(errors, 'filters', 'filters 必须是数组');
  } else {
    spec.filters.forEach((f, i) => {
      const p = `filters[${i}]`;
      if (!f || typeof f !== 'object') return err(errors, p, '筛选器必须是对象');
      if (!fieldKeys.has(f.field)) err(errors, `${p}.field`, `筛选器引用了不存在的字段: ${String(f.field)}`);
      if (typeof f.label !== 'string' || !f.label.trim()) err(errors, `${p}.label`, '筛选器 label 不能为空');
    });
  }

  // metrics
  if (!Array.isArray(spec.metrics)) {
    err(errors, 'metrics', 'metrics 必须是数组');
  } else {
    const checkWhere = (where, p) => {
      if (where === undefined || where === null) return;
      if (typeof where !== 'object') return err(errors, p, 'where 必须是对象');
      if (!fieldKeys.has(where.field)) err(errors, `${p}.field`, `where 引用了不存在的字段: ${String(where.field)}`);
      if (where.value === undefined) err(errors, `${p}.value`, 'where.value 不能为 undefined');
    };
    spec.metrics.forEach((m, i) => {
      const p = `metrics[${i}]`;
      if (!m || typeof m !== 'object') return err(errors, p, '指标必须是对象');
      if (!METRIC_TYPES.includes(m.type)) err(errors, `${p}.type`, `未知指标类型: ${String(m.type)}`);
      if (typeof m.label !== 'string' || !m.label.trim()) err(errors, `${p}.label`, '指标 label 不能为空');
      if (m.format !== undefined && !METRIC_FORMATS.includes(m.format)) {
        err(errors, `${p}.format`, `未知指标格式: ${String(m.format)}`);
      }
      if (['sum', 'avg', 'delta'].includes(m.type) && !fieldKeys.has(m.field)) {
        err(errors, `${p}.field`, `指标引用了不存在的字段: ${String(m.field)}`);
      }
      if (m.type === 'percent' && !m.where) {
        err(errors, `${p}.where`, 'percent 指标必须提供 where');
      }
      if (m.type === 'delta') {
        checkWhere(m.plusWhere, `${p}.plusWhere`);
        checkWhere(m.minusWhere, `${p}.minusWhere`);
        if (!m.plusWhere || !m.minusWhere) err(errors, `${p}`, 'delta 指标必须同时提供 plusWhere / minusWhere');
      }
      checkWhere(m.where, `${p}.where`);
    });
  }

  // seed items
  if (!Array.isArray(spec.seedItems)) {
    err(errors, 'seedItems', 'seedItems 必须是数组');
  } else if (spec.seedItems.length > 30) {
    warnings.push({ path: 'seedItems', message: '示例数据过多' });
  }

  if (typeof spec.sourcePrompt !== 'string') err(errors, 'sourcePrompt', 'sourcePrompt 必须是字符串');

  return { ok: errors.length === 0, errors, warnings };
}

/** Convenience: throw-free boolean check. */
export function isValidSpec(spec) {
  return validateSpec(spec).ok;
}

export function formatSpecErrors(report) {
  if (!report || report.ok) return '';
  return report.errors.map((e) => `${e.path}: ${e.message}`).join('\n');
}
