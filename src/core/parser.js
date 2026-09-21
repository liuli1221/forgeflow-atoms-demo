/**
 * Prompt -> AppSpec parser (the "Local Agent" understanding stage).
 *
 * This is a deterministic, rule-based natural-language parser. It is NOT an
 * LLM and never pretends to be one: it scores domain keywords, detects feature
 * requests, handles negations ("不需要搜索"), extracts an app name and then
 * assembles a structured AppSpec. Pure + DOM-free so it is unit-testable.
 */
import { uid, uniqueBy, slugKey } from './util.js';
import { getBlueprint, categoryOptions, buildMetrics, buildSeedItems } from './blueprints.js';

export const DOMAIN_KEYWORDS = {
  task: ['任务管理', '任务', '待办', '清单', '计划', '看板', 'kanban', 'todo', 'to-do', 'task', '工单', '项目管理', '备考', '复习'],
  habit: ['习惯', '打卡', '坚持', '自律', '连续天数', '日常', 'habit', 'streak', 'routine', 'checkin', '签到'],
  budget: ['记账', '收支', '预算', '账本', '开销', '花销', '消费', '理财', '财务', '报销', 'budget', 'expense', 'finance', 'money'],
  feedback: ['反馈', '评价', '意见', '建议', '满意度', '打分', '评分表', 'feedback', 'review', 'survey', '投诉', '复盘记录'],
  inventory: ['库存', '仓库', '入库', '出库', '补货', 'sku', 'inventory', 'stock', '物料'],
  crm: ['客户管理', '客户跟进', '销售线索', '商机', 'crm', 'customer', '销售漏斗'],
  event: ['活动管理', '日程管理', '会议安排', '活动报名', 'event', 'schedule', 'calendar'],
  library: ['图书管理', '书籍管理', '借阅', '书库', 'library', 'book'],
};

export const FEATURE_KEYWORDS = {
  priority: ['优先级', '优先', '重要程度', '重要性', '紧急', 'priority'],
  due: ['截止', '到期', '期限', 'deadline', 'due', '排期', '日程'],
  notes: ['备注', '描述', '说明', '详情', '笔记', 'note', 'remark'],
  tags: ['标签', 'tag'],
  owner: ['负责人', '指派', '分配给', 'owner', 'assignee'],
  effort: ['用时', '工时', '耗时', '预计时间', '时长', 'estimate'],
  rating: ['评分', '打分', '分数', 'rating', 'score'],
  streak: ['连续', '坚持天数', 'streak'],
  target: ['目标次数', '目标值', '目标', 'target', 'goal'],
  method: ['支付方式', '付款方式', 'payment'],
  amount: ['金额', '数量', '价格', 'amount', 'price'],
  price: ['单价', '售价', '价格', 'price'],
  supplier: ['供应商', '供货商', 'supplier'],
  threshold: ['补货阈值', '安全库存', 'threshold'],
  capacity: ['人数上限', '容量', 'capacity'],
  isbn: ['isbn', '书号'],
};

export const LAYOUT_KEYWORDS = {
  search: ['搜索', '查找', '检索', 'search'],
  filters: ['筛选', '过滤', '分类筛选', 'filter', '按分类', '按状态'],
  stats: ['统计', '进度', '完成率', '仪表盘', '概览', '汇总', '数据面板', 'dashboard', 'stats', 'progress'],
};

export const VIEW_KEYWORDS = {
  table: ['表格', '明细表', 'table', '表视图'],
  cards: ['卡片', '网格', 'card', 'grid'],
  list: ['紧凑列表', '简洁列表', '列表视图'],
};

export const THEME_KEYWORDS = {
  dark: ['暗色', '深色', '夜间', '黑色主题', 'dark mode', 'dark'],
  light: ['亮色', '浅色', '白色主题', 'light mode', 'light'],
};

export const NEGATORS = ['不需要', '不要', '无需', '去掉', '移除', '删掉', '取消', '关闭', '别加', '不用', 'without', 'no '];

const FLAVOR_KEYWORDS = ['面试', '求职', '笔试', '面经', 'interview', '校招', '社招'];

/** true when the keyword occurrence is preceded by a negation word. */
function negatedAt(text, index) {
  const window = text.slice(Math.max(0, index - 6), index);
  return NEGATORS.some((n) => window.includes(n));
}

/** Find keyword hits, ignoring negated occurrences. Returns {hits, negated}. */
export function matchKeywords(text, keywords) {
  const hits = [];
  const negated = [];
  for (const kw of keywords) {
    let from = 0;
    for (;;) {
      const idx = text.indexOf(kw, from);
      if (idx === -1) break;
      (negatedAt(text, idx) ? negated : hits).push(kw);
      from = idx + kw.length;
    }
  }
  return { hits: [...new Set(hits)], negated: [...new Set(negated)] };
}

export function detectDomain(text) {
  const scores = {};
  const signals = {};
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const { hits } = matchKeywords(text, keywords);
    scores[domain] = hits.reduce((acc, kw) => acc + Math.max(2, kw.length), 0);
    signals[domain] = hits;
  }
  let best = 'generic';
  let bestScore = 0;
  for (const [domain, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = domain;
      bestScore = score;
    }
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  return {
    domain: bestScore > 0 ? best : 'generic',
    score: bestScore,
    confidence: bestScore > 0 ? Math.min(0.98, 0.45 + (bestScore / total) * 0.5) : 0.3,
    matched: bestScore > 0 ? signals[best] : [],
    scores,
  };
}

export function detectFlavor(text) {
  return FLAVOR_KEYWORDS.some((k) => text.includes(k)) ? 'interview' : 'default';
}

const LEADING_VERBS = /^(请|帮我|帮忙|麻烦|我想要|我想|我要|我需要|想要|需要|能不能|可以)+/;
const BUILD_VERBS = /^(做|搞|弄|整|搭建|搭|创建|新建|建|生成|开发|写|来|制作|构建|build|create|make|generate|design)\s*/i;
const ARTICLES = /^(一个|一款|一套|一份|个|a|an|the)\s*/i;
const TAIL_NOISE = /(的)?(小?网页|小?网站|小?页面|小?程序|小?demo|小?应用程序)$/i;

export function extractAppName(rawPrompt, domain) {
  const bp = getBlueprint(domain);
  let s = String(rawPrompt || '').trim();
  s = s.split(/[，,。；;！!？?\n\r]/)[0] || '';
  for (let i = 0; i < 3; i += 1) {
    s = s.trim().replace(LEADING_VERBS, '').replace(BUILD_VERBS, '').replace(ARTICLES, '');
  }
  s = s.trim().replace(TAIL_NOISE, '').trim();
  s = s.replace(/^[「『"'`]|[」』"'`]$/g, '').trim();
  if (!s || s.length < 2 || s.length > 24) return bp.defaultName;
  return s;
}

function buildFields(domain, flavor, features) {
  const bp = getBlueprint(domain);
  const fields = bp.baseFields.map((field) => {
    const copy = { ...field, options: field.options ? [...field.options] : undefined };
    if (copy.key === 'category') {
      copy.options = categoryOptions(domain, flavor);
      copy.default = copy.options[0];
    }
    if (copy.options === undefined) delete copy.options;
    return copy;
  });

  for (const [key, enabled] of Object.entries(features)) {
    if (!enabled) continue;
    const optional = bp.optionalFields[key];
    if (!optional) continue;
    if (fields.some((x) => x.key === optional.key)) continue;
    fields.push({ ...optional, options: optional.options ? [...optional.options] : undefined });
  }

  return uniqueBy(fields, (x) => x.key).map((x) => {
    if (x.options === undefined) delete x.options;
    return x;
  });
}

function inferCustomField(descriptor, index) {
  const clean = String(descriptor || '')
    .replace(/^[-*\d.、\s]+/, '')
    .replace(/(?:这个)?(?:字段|列|属性)$/u, '')
    .trim();
  if (!clean || clean.length > 40) return null;

  const match = clean.match(/^([^（(\[【:：]{1,20})(?:[（(\[【:：]([^）)\]】]{1,120})[）)\]】]?)?$/u);
  const label = (match ? match[1] : clean).replace(/(?:必填|可选)$/u, '').trim();
  if (!label || /^(搜索|筛选|统计|暗色|亮色|表格|卡片)$/u.test(label)) return null;

  const optionText = match && match[2] ? match[2].trim() : '';
  const options = optionText
    ? optionText.split(/[\/|、，,]/u).map((x) => x.trim()).filter(Boolean).slice(0, 12)
    : [];
  let type = 'text';
  if (options.length >= 2) type = 'select';
  else if (/备注|描述|说明|详情|内容|笔记/u.test(label)) type = 'textarea';
  else if (/日期|时间|生日|截止|期限/u.test(label)) type = 'date';
  else if (/是否|启用|完成|已读|选中/u.test(label)) type = 'checkbox';
  else if (/金额|价格|费用|数量|库存|评分|分数|次数|体重|年龄|容量|比例/u.test(label)) type = 'number';

  const field = {
    key: slugKey(label, `field${index + 1}`),
    label,
    type,
    required: /必填/u.test(clean),
  };
  if (index === 0) field.primary = true;
  if (type === 'select') {
    field.options = options;
    field.default = options[0];
  } else if (type === 'number') field.default = 0;
  else if (type === 'checkbox') field.default = false;
  return field;
}

/** Extract an explicit schema such as “字段包括书名、作者、评分、状态(在库/借出)”. */
export function extractCustomFields(rawPrompt) {
  const text = String(rawPrompt || '');
  const match = text.match(/(?:字段(?:包括|包含|有|为)?|包含以下字段|记录字段)\s*[:：]?\s*([^。；;\n]{2,260})/iu);
  if (!match) return [];
  const section = match[1]
    .replace(/[，,]\s*(?:并且|同时|另外)?\s*(?:支持|需要|带有)\s*(?:搜索|筛选|统计|暗色|亮色|表格|卡片).*$/u, '')
    .trim();
  const descriptors = [];
  let current = '';
  let depth = 0;
  for (const char of section) {
    if ('（(【['.includes(char)) depth += 1;
    if ('）)】]'.includes(char)) depth = Math.max(0, depth - 1);
    if (depth === 0 && /[、，,]/u.test(char)) {
      if (current.trim()) descriptors.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) descriptors.push(current.trim());
  return uniqueBy(
    descriptors.map((part, index) => inferCustomField(part, index)).filter(Boolean),
    (field) => field.key,
  ).slice(0, 12).map((field, index) => ({ ...field, primary: index === 0 }));
}

function inferEntityName(appName) {
  const value = String(appName || '')
    .replace(/(?:管理器|管理系统|系统|应用|工具|平台|小程序|档案)$/u, '')
    .trim();
  return value && value.length <= 10 ? value : '记录';
}

function buildFilters(domain, fields, enabled) {
  if (!enabled) return [];
  const bp = getBlueprint(domain);
  const preferred = bp.filterFields
    .map((key) => fields.find((x) => x.key === key))
    .filter(Boolean);
  const explicitSelects = fields.filter((field) => field.type === 'select');
  return uniqueBy(preferred.concat(explicitSelects), (field) => field.key)
    .filter(Boolean)
    .filter((x) => x.type === 'select')
    .map((x) => ({ key: `filter_${x.key}`, field: x.key, label: x.label }));
}

/**
 * Parse free text into an AppSpec.
 *
 * @returns {{ok:boolean, spec:object|null, analysis:object}}
 *   `analysis` always exists and explains what the agent understood.
 */
export function parsePrompt(rawPrompt, options = {}) {
  const analysis = {
    ok: false,
    rawPrompt: typeof rawPrompt === 'string' ? rawPrompt : '',
    normalized: '',
    domain: 'generic',
    confidence: 0,
    matched: [],
    features: [],
    removed: [],
    notes: [],
    fallback: false,
    customFields: [],
  };

  if (typeof rawPrompt !== 'string') {
    analysis.notes.push('输入不是文本，无法解析。');
    return { ok: false, spec: null, analysis };
  }
  const trimmed = rawPrompt.trim();
  if (trimmed.length < 4) {
    analysis.notes.push('需求描述太短（至少 4 个字符），请补充你想要什么应用。');
    return { ok: false, spec: null, analysis };
  }
  if (trimmed.length > 2000) {
    analysis.notes.push('需求描述超过 2000 字符，已截断解析。');
  }

  const text = trimmed.slice(0, 2000).toLowerCase();
  analysis.normalized = text;

  const domainInfo = detectDomain(text);
  const flavor = detectFlavor(text);
  const explicitFields = extractCustomFields(trimmed);
  const domain = domainInfo.domain === 'generic' && explicitFields.length >= 2 ? 'custom' : domainInfo.domain;
  analysis.domain = domain;
  analysis.confidence = Number(domainInfo.confidence.toFixed(2));
  analysis.matched = domainInfo.matched;
  analysis.flavor = flavor;
  analysis.customFields = explicitFields.map((field) => ({ key: field.key, label: field.label, type: field.type }));
  if (domain === 'generic') {
    analysis.fallback = true;
    analysis.notes.push('未命中已知领域且没有显式字段定义，使用通用模板兜底。');
  } else if (domain === 'custom') {
    analysis.notes.push(`识别到 ${explicitFields.length} 个显式字段，使用自定义 Schema 生成应用。`);
  }

  // --- feature detection -------------------------------------------------
  const bp = getBlueprint(domain);
  const features = {};
  for (const [key, keywords] of Object.entries(FEATURE_KEYWORDS)) {
    if (!bp.optionalFields[key]) continue;
    const { hits, negated } = matchKeywords(text, keywords);
    if (hits.length) {
      features[key] = true;
      analysis.features.push(bp.optionalFields[key].label);
    } else if (negated.length) {
      features[key] = false;
      analysis.removed.push(bp.optionalFields[key].label);
    }
  }
  // Sensible defaults: every app gets a notes field unless explicitly refused.
  if (features.notes === undefined && bp.optionalFields.notes && explicitFields.length === 0) features.notes = true;

  // --- layout / theme ----------------------------------------------------
  const layout = { view: 'cards', showSearch: true, showFilters: true, showStats: true };
  for (const [flag, keywords] of Object.entries(LAYOUT_KEYWORDS)) {
    const { hits, negated } = matchKeywords(text, keywords);
    const target = flag === 'search' ? 'showSearch' : flag === 'filters' ? 'showFilters' : 'showStats';
    if (negated.length && !hits.length) {
      layout[target] = false;
      analysis.removed.push(flag === 'search' ? '搜索' : flag === 'filters' ? '筛选' : '统计');
    } else if (hits.length) {
      layout[target] = true;
      analysis.features.push(flag === 'search' ? '搜索' : flag === 'filters' ? '筛选' : '统计');
    }
  }
  for (const [view, keywords] of Object.entries(VIEW_KEYWORDS)) {
    const { hits } = matchKeywords(text, keywords);
    if (hits.length) {
      layout.view = view;
      analysis.features.push(`${view} 视图`);
      break;
    }
  }

  let mode = 'light';
  if (matchKeywords(text, THEME_KEYWORDS.dark).hits.length) {
    mode = 'dark';
    analysis.features.push('暗色主题');
  } else if (matchKeywords(text, THEME_KEYWORDS.light).hits.length) {
    mode = 'light';
  }

  let fields = buildFields(domain, flavor, features);
  if (explicitFields.length) {
    const existingLabels = new Set(fields.map((field) => field.label.toLowerCase()));
    const additions = explicitFields.filter((field) => !existingLabels.has(field.label.toLowerCase()));
    fields = domain === 'custom' ? explicitFields : fields.concat(additions);
    fields = uniqueBy(fields, (field) => field.key).slice(0, 12);
    fields = fields.map((field, index) => ({ ...field, primary: index === 0 }));
  }
  const filters = buildFilters(domain, fields, layout.showFilters);
  const metrics = layout.showStats ? buildMetrics(domain, fields) : [{ key: 'total', label: '总数', type: 'count', format: 'number' }];
  const seedItems = buildSeedItems(domain, fields, flavor);

  const appName = (options.appName || extractAppName(trimmed, domain)).slice(0, 40);
  const spec = {
    specVersion: 1,
    appId: options.appId || uid('app'),
    appName,
    tagline: bp.tagline,
    domain,
    flavor,
    entityName: domain === 'custom' ? inferEntityName(appName) : bp.entityName,
    theme: { mode, accent: bp.accent, density: 'comfortable' },
    layout,
    fields,
    filters,
    metrics,
    seedItems,
    sourcePrompt: trimmed.slice(0, 2000),
    createdAt: options.now || new Date().toISOString(),
  };

  analysis.ok = true;
  analysis.features = [...new Set(analysis.features)];
  analysis.removed = [...new Set(analysis.removed)];
  return { ok: true, spec, analysis };
}
