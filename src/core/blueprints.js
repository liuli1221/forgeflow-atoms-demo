/**
 * Domain blueprints.
 *
 * A blueprint describes "what a <domain> app is made of": its base fields, the
 * optional fields a user can ask for, which fields make good filters, and how
 * to derive metrics + seed data. The parser picks a blueprint and then tunes it
 * from the user's words; the generator never sees the blueprint, only the
 * resulting AppSpec.
 */

const f = (key, label, type, extra = {}) => ({ key, label, type, required: false, ...extra });

/** Interview-flavoured category presets kick in when the prompt mentions 面试/interview. */
const CATEGORY_PRESETS = {
  task: {
    default: ['工作', '学习', '生活', '其他'],
    interview: ['简历与作品', '算法与编程', '项目复盘', '面试演练', '行业调研'],
  },
  habit: {
    default: ['健康', '学习', '工作', '心态'],
    interview: ['算法练习', '英语口语', '项目复盘', '作息健康'],
  },
  budget: {
    default: ['餐饮', '交通', '住房', '学习', '娱乐', '其他'],
    interview: ['课程培训', '交通差旅', '证件资料', '形象着装', '其他'],
  },
  feedback: {
    default: ['产品', '服务', '流程', '其他'],
    interview: ['技术面', '项目面', 'HR 面', '模拟面试'],
  },
  generic: {
    default: ['默认', '重要', '归档'],
    interview: ['准备中', '进行中', '已复盘'],
  },
};

export function categoryOptions(domain, flavor = 'default') {
  const preset = CATEGORY_PRESETS[domain] || CATEGORY_PRESETS.generic;
  return [...(preset[flavor] || preset.default)];
}

export const BLUEPRINTS = {
  task: {
    domain: 'task',
    entityName: '任务',
    defaultName: '任务管理器',
    tagline: '拆解任务、跟踪进度，把待办变成可交付的结果。',
    accent: '#4f6bed',
    baseFields: [
      f('title', '任务名称', 'text', { primary: true, required: true, placeholder: '例如：刷完动态规划专题' }),
      f('category', '分类', 'select', { options: [], default: '' }),
      f('status', '状态', 'select', { options: ['待开始', '进行中', '已完成'], default: '待开始' }),
    ],
    optionalFields: {
      priority: f('priority', '优先级', 'select', { options: ['高', '中', '低'], default: '中' }),
      due: f('due', '截止日期', 'date'),
      notes: f('notes', '备注', 'textarea', { placeholder: '补充说明、验收标准…' }),
      effort: f('effort', '预计用时(小时)', 'number', { default: 1 }),
      owner: f('owner', '负责人', 'text'),
      tags: f('tags', '标签', 'text', { placeholder: '用逗号分隔' }),
    },
    filterFields: ['category', 'status', 'priority'],
    doneField: { field: 'status', value: '已完成' },
  },

  habit: {
    domain: 'habit',
    entityName: '习惯',
    defaultName: '习惯打卡器',
    tagline: '每天一点点，把长期目标变成可见的连续记录。',
    accent: '#1f9d6b',
    baseFields: [
      f('title', '习惯名称', 'text', { primary: true, required: true, placeholder: '例如：每天 30 分钟算法' }),
      f('category', '分类', 'select', { options: [], default: '' }),
      f('frequency', '频率', 'select', { options: ['每天', '工作日', '每周三次', '每周'], default: '每天' }),
      f('done', '今日已完成', 'checkbox', { default: false }),
    ],
    optionalFields: {
      streak: f('streak', '连续天数', 'number', { default: 0 }),
      target: f('target', '每周目标次数', 'number', { default: 5 }),
      notes: f('notes', '备注', 'textarea'),
      priority: f('priority', '优先级', 'select', { options: ['高', '中', '低'], default: '中' }),
      due: f('due', '开始日期', 'date'),
    },
    filterFields: ['category', 'frequency', 'priority'],
    doneField: { field: 'done', value: true },
  },

  budget: {
    domain: 'budget',
    entityName: '收支记录',
    defaultName: '收支记账本',
    tagline: '记录每一笔收支，随时看清结余。',
    accent: '#c2703a',
    baseFields: [
      f('title', '条目', 'text', { primary: true, required: true, placeholder: '例如：算法课程' }),
      f('type', '类型', 'select', { options: ['支出', '收入'], default: '支出' }),
      f('category', '分类', 'select', { options: [], default: '' }),
      f('amount', '金额(元)', 'number', { required: true, default: 0 }),
      f('date', '日期', 'date'),
    ],
    optionalFields: {
      notes: f('notes', '备注', 'textarea'),
      method: f('method', '支付方式', 'select', { options: ['移动支付', '银行卡', '现金'], default: '移动支付' }),
      priority: f('priority', '重要程度', 'select', { options: ['高', '中', '低'], default: '中' }),
      tags: f('tags', '标签', 'text'),
    },
    filterFields: ['type', 'category', 'method'],
    doneField: null,
  },

  feedback: {
    domain: 'feedback',
    entityName: '反馈',
    defaultName: '反馈收集台',
    tagline: '收集每一条反馈，按情绪与状态排优先级。',
    accent: '#8a5cf6',
    baseFields: [
      f('title', '反馈主题', 'text', { primary: true, required: true, placeholder: '例如：二面算法题答得偏慢' }),
      f('source', '来源', 'select', { options: ['面试官', '同事', '用户', '自评'], default: '自评' }),
      f('category', '分类', 'select', { options: [], default: '' }),
      f('sentiment', '情绪', 'select', { options: ['正面', '中性', '负面'], default: '中性' }),
      f('status', '处理状态', 'select', { options: ['待处理', '处理中', '已完成'], default: '待处理' }),
    ],
    optionalFields: {
      rating: f('rating', '评分(1-5)', 'number', { default: 3 }),
      notes: f('notes', '详情', 'textarea'),
      owner: f('owner', '负责人', 'text'),
      due: f('due', '跟进日期', 'date'),
      priority: f('priority', '优先级', 'select', { options: ['高', '中', '低'], default: '中' }),
    },
    filterFields: ['source', 'category', 'sentiment', 'status'],
    doneField: { field: 'status', value: '已完成' },
  },

  generic: {
    domain: 'generic',
    entityName: '条目',
    defaultName: '轻量记录器',
    tagline: '一个通用的增删改查小工具，随时可以继续改造。',
    accent: '#3f6b8f',
    baseFields: [
      f('title', '名称', 'text', { primary: true, required: true, placeholder: '输入一个条目名称' }),
      f('category', '分类', 'select', { options: [], default: '' }),
      f('status', '状态', 'select', { options: ['待办', '进行中', '已完成'], default: '待办' }),
    ],
    optionalFields: {
      priority: f('priority', '优先级', 'select', { options: ['高', '中', '低'], default: '中' }),
      due: f('due', '日期', 'date'),
      notes: f('notes', '备注', 'textarea'),
      amount: f('amount', '数量', 'number', { default: 1 }),
      tags: f('tags', '标签', 'text'),
    },
    filterFields: ['category', 'status', 'priority'],
    doneField: { field: 'status', value: '已完成' },
  },
};

export function getBlueprint(domain) {
  return BLUEPRINTS[domain] || BLUEPRINTS.generic;
}

/** Build metrics that only reference fields actually present in the spec. */
export function buildMetrics(domain, fields) {
  const has = (k) => fields.some((x) => x.key === k);
  const out = [{ key: 'total', label: '总数', type: 'count', format: 'number' }];

  if (domain === 'budget') {
    if (has('amount') && has('type')) {
      out.push({ key: 'income', label: '收入合计', type: 'sum', field: 'amount', where: { field: 'type', value: '收入' }, format: 'currency' });
      out.push({ key: 'expense', label: '支出合计', type: 'sum', field: 'amount', where: { field: 'type', value: '支出' }, format: 'currency' });
      out.push({
        key: 'balance',
        label: '结余',
        type: 'delta',
        field: 'amount',
        plusWhere: { field: 'type', value: '收入' },
        minusWhere: { field: 'type', value: '支出' },
        format: 'currency',
      });
    }
    return out;
  }

  if (domain === 'habit') {
    if (has('done')) {
      out.push({ key: 'done_today', label: '今日完成', type: 'count', where: { field: 'done', value: true }, format: 'number' });
      out.push({ key: 'done_rate', label: '今日完成率', type: 'percent', where: { field: 'done', value: true }, format: 'percent' });
    }
    if (has('streak')) out.push({ key: 'avg_streak', label: '平均连续天数', type: 'avg', field: 'streak', format: 'number' });
    return out;
  }

  if (domain === 'feedback') {
    if (has('status')) {
      out.push({ key: 'pending', label: '待处理', type: 'count', where: { field: 'status', value: '待处理' }, format: 'number' });
      out.push({ key: 'done_rate', label: '处理完成率', type: 'percent', where: { field: 'status', value: '已完成' }, format: 'percent' });
    }
    if (has('rating')) out.push({ key: 'avg_rating', label: '平均评分', type: 'avg', field: 'rating', format: 'number' });
    if (has('sentiment')) out.push({ key: 'positive', label: '正面占比', type: 'percent', where: { field: 'sentiment', value: '正面' }, format: 'percent' });
    return out;
  }

  // task / generic
  const bp = getBlueprint(domain);
  const done = bp.doneField;
  if (done && has(done.field)) {
    out.push({ key: 'done_count', label: '已完成', type: 'count', where: { ...done }, format: 'number' });
    out.push({ key: 'done_rate', label: '完成率', type: 'percent', where: { ...done }, format: 'percent' });
  }
  if (has('priority')) {
    out.push({ key: 'high_priority', label: '高优先级', type: 'count', where: { field: 'priority', value: '高' }, format: 'number' });
  }
  return out;
}

/** Seed rows, generated from whichever fields survived the parse. */
export function buildSeedItems(domain, fields, flavor = 'default') {
  const pick = (k) => fields.find((x) => x.key === k);
  const cats = (pick('category') && pick('category').options) || categoryOptions(domain, flavor);

  const SEEDS = {
    task: [
      { title: '整理项目复盘文档', category: cats[0], status: '进行中', priority: '高', effort: 3, notes: 'STAR 结构，突出量化结果' },
      { title: '刷完动态规划专题', category: cats[1] || cats[0], status: '待开始', priority: '高', effort: 6 },
      { title: '模拟面试一轮', category: cats[3] || cats[0], status: '待开始', priority: '中', effort: 2 },
      { title: '更新简历到最新版本', category: cats[0], status: '已完成', priority: '中', effort: 2 },
    ],
    habit: [
      { title: '每天 30 分钟算法', category: cats[0], frequency: '每天', done: true, streak: 12, target: 7 },
      { title: '晨间英语口语 15 分钟', category: cats[1] || cats[0], frequency: '工作日', done: false, streak: 4, target: 5 },
      { title: '睡前项目复盘 10 分钟', category: cats[2] || cats[0], frequency: '每天', done: false, streak: 2, target: 7 },
    ],
    budget: [
      { title: '算法进阶课程', type: '支出', category: cats[0], amount: 399, date: '2026-09-02' },
      { title: '面试往返高铁票', type: '支出', category: cats[1] || cats[0], amount: 218, date: '2026-09-08' },
      { title: '兼职项目结款', type: '收入', category: cats[cats.length - 1], amount: 2400, date: '2026-09-10' },
    ],
    feedback: [
      { title: '算法题思路正确但耗时偏长', source: '面试官', category: cats[0], sentiment: '负面', status: '处理中', rating: 3 },
      { title: '项目讲述结构清晰', source: '面试官', category: cats[1] || cats[0], sentiment: '正面', status: '已完成', rating: 5 },
      { title: '薪资沟通准备不足', source: '自评', category: cats[2] || cats[0], sentiment: '中性', status: '待处理', rating: 2 },
    ],
    generic: [
      { title: '示例条目 A', category: cats[0], status: '待办' },
      { title: '示例条目 B', category: cats[1] || cats[0], status: '进行中' },
      { title: '示例条目 C', category: cats[0], status: '已完成' },
    ],
  };

  const rows = SEEDS[domain] || SEEDS.generic;
  // Keep only keys that exist in the final field list, and fill defaults.
  return rows.map((row) => {
    const item = {};
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(row, field.key)) item[field.key] = row[field.key];
      else if (field.default !== undefined) item[field.key] = field.default;
      else item[field.key] = field.type === 'checkbox' ? false : field.type === 'number' ? 0 : '';
      if (field.type === 'select' && !field.options.includes(item[field.key])) {
        item[field.key] = field.default && field.options.includes(field.default) ? field.default : field.options[0];
      }
    }
    return item;
  });
}
