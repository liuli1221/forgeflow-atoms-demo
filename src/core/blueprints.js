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
  inventory: {
    default: ['办公用品', '设备', '耗材', '其他'],
    interview: ['学习设备', '资料', '差旅物品', '其他'],
  },
  crm: {
    default: ['潜在客户', '跟进中', '已成交', '已流失'],
    interview: ['目标公司', '内推人', '猎头', '其他'],
  },
  event: {
    default: ['会议', '活动', '培训', '其他'],
    interview: ['笔试', '技术面', 'HR 面', '复盘'],
  },
  library: {
    default: ['技术', '商业', '文学', '其他'],
    interview: ['算法', '系统设计', '项目管理', '行业研究'],
  },
  custom: {
    default: ['默认', '重要', '归档'],
    interview: ['准备中', '进行中', '已复盘'],
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

  inventory: {
    domain: 'inventory',
    entityName: '库存项',
    defaultName: '库存管理器',
    tagline: '记录库存、位置和补货状态，及时发现短缺。',
    accent: '#2f7d8c',
    baseFields: [
      f('title', '物品名称', 'text', { primary: true, required: true }),
      f('sku', 'SKU', 'text', { required: true }),
      f('category', '分类', 'select', { options: [], default: '' }),
      f('quantity', '库存数量', 'number', { default: 0 }),
      f('location', '存放位置', 'text'),
      f('status', '库存状态', 'select', { options: ['充足', '偏低', '缺货'], default: '充足' }),
    ],
    optionalFields: {
      price: f('price', '单价', 'number', { default: 0 }),
      supplier: f('supplier', '供应商', 'text'),
      threshold: f('threshold', '补货阈值', 'number', { default: 5 }),
      notes: f('notes', '备注', 'textarea'),
      tags: f('tags', '标签', 'text'),
    },
    filterFields: ['category', 'status'],
    doneField: null,
  },

  crm: {
    domain: 'crm',
    entityName: '客户',
    defaultName: '客户跟进台',
    tagline: '集中管理客户线索、阶段和下一次跟进。',
    accent: '#3867b4',
    baseFields: [
      f('title', '客户名称', 'text', { primary: true, required: true }),
      f('company', '公司', 'text'),
      f('stage', '跟进阶段', 'select', { options: ['新线索', '沟通中', '方案中', '已成交', '已流失'], default: '新线索' }),
      f('contact', '联系方式', 'text'),
      f('next_follow_up', '下次跟进日期', 'date'),
    ],
    optionalFields: {
      owner: f('owner', '负责人', 'text'),
      amount: f('amount', '预计金额', 'number', { default: 0 }),
      rating: f('rating', '意向评分', 'number', { default: 3 }),
      notes: f('notes', '跟进记录', 'textarea'),
      tags: f('tags', '标签', 'text'),
    },
    filterFields: ['stage'],
    doneField: { field: 'stage', value: '已成交' },
  },

  event: {
    domain: 'event',
    entityName: '日程',
    defaultName: '活动日程管理器',
    tagline: '安排时间、地点和参与状态，避免遗漏关键日程。',
    accent: '#8b5a2b',
    baseFields: [
      f('title', '活动名称', 'text', { primary: true, required: true }),
      f('category', '类型', 'select', { options: [], default: '' }),
      f('date', '日期', 'date'),
      f('location', '地点', 'text'),
      f('status', '状态', 'select', { options: ['待确认', '已确认', '已完成', '已取消'], default: '待确认' }),
    ],
    optionalFields: {
      owner: f('owner', '负责人', 'text'),
      capacity: f('capacity', '人数上限', 'number', { default: 20 }),
      notes: f('notes', '说明', 'textarea'),
      tags: f('tags', '标签', 'text'),
    },
    filterFields: ['category', 'status'],
    doneField: { field: 'status', value: '已完成' },
  },

  library: {
    domain: 'library',
    entityName: '图书',
    defaultName: '图书管理器',
    tagline: '管理书目、借阅状态和阅读评价。',
    accent: '#7653a6',
    baseFields: [
      f('title', '书名', 'text', { primary: true, required: true }),
      f('author', '作者', 'text'),
      f('category', '分类', 'select', { options: [], default: '' }),
      f('status', '借阅状态', 'select', { options: ['在库', '已借出', '预约中'], default: '在库' }),
    ],
    optionalFields: {
      isbn: f('isbn', 'ISBN', 'text'),
      rating: f('rating', '评分', 'number', { default: 3 }),
      due: f('due', '归还日期', 'date'),
      notes: f('notes', '读书笔记', 'textarea'),
      tags: f('tags', '标签', 'text'),
    },
    filterFields: ['category', 'status'],
    doneField: null,
  },

  custom: {
    domain: 'custom',
    entityName: '记录',
    defaultName: '自定义数据应用',
    tagline: '按你的字段定义生成可搜索、筛选和统计的数据应用。',
    accent: '#356d74',
    baseFields: [
      f('title', '名称', 'text', { primary: true, required: true }),
    ],
    optionalFields: {
      notes: f('notes', '备注', 'textarea'),
      category: f('category', '分类', 'select', { options: ['默认', '重要', '归档'], default: '默认' }),
      priority: f('priority', '优先级', 'select', { options: ['高', '中', '低'], default: '中' }),
      due: f('due', '日期', 'date'),
      amount: f('amount', '数量', 'number', { default: 0 }),
      rating: f('rating', '评分', 'number', { default: 3 }),
      tags: f('tags', '标签', 'text'),
    },
    filterFields: [],
    doneField: null,
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

  if (domain === 'inventory') {
    if (has('quantity')) out.push({ key: 'stock_total', label: '库存合计', type: 'sum', field: 'quantity', format: 'number' });
    if (has('status')) out.push({ key: 'low_stock', label: '缺货项', type: 'count', where: { field: 'status', value: '缺货' }, format: 'number' });
    return out;
  }

  if (domain === 'library') {
    if (has('status')) out.push({ key: 'borrowed', label: '已借出', type: 'count', where: { field: 'status', value: '已借出' }, format: 'number' });
    if (has('rating')) out.push({ key: 'avg_rating', label: '平均评分', type: 'avg', field: 'rating', format: 'number' });
    return out;
  }

  if (domain === 'custom') {
    const numeric = fields.filter((x) => x.type === 'number').slice(0, 2);
    for (const field of numeric) {
      const avg = /评分|分数|比例|率/.test(field.label);
      out.push({
        key: `${avg ? 'avg' : 'sum'}_${field.key}`.slice(0, 32),
        label: `${field.label}${avg ? '平均值' : '合计'}`,
        type: avg ? 'avg' : 'sum',
        field: field.key,
        format: /金额|价格|费用/.test(field.label) ? 'currency' : 'number',
      });
    }
    const checkbox = fields.find((x) => x.type === 'checkbox');
    if (checkbox) out.push({ key: 'checked_rate', label: `${checkbox.label}占比`, type: 'percent', where: { field: checkbox.key, value: true }, format: 'percent' });
    return out;
  }

  // task / crm / event / generic
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

  if (domain === 'custom') {
    return ['A', 'B'].map((suffix, rowIndex) => {
      const item = {};
      fields.forEach((field, fieldIndex) => {
        if (fieldIndex === 0) item[field.key] = `示例${field.label} ${suffix}`;
        else if (field.type === 'select') item[field.key] = field.options[rowIndex % field.options.length];
        else if (field.type === 'checkbox') item[field.key] = rowIndex === 0;
        else if (field.type === 'number') item[field.key] = rowIndex + 1;
        else if (field.type === 'date') item[field.key] = `2026-09-${22 + rowIndex}`;
        else item[field.key] = '';
      });
      return item;
    });
  }

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
    inventory: [
      { title: '无线键盘', sku: 'KB-001', category: cats[1] || cats[0], quantity: 18, location: 'A-02', status: '充足' },
      { title: '打印纸', sku: 'PP-008', category: cats[2] || cats[0], quantity: 3, location: 'B-11', status: '偏低' },
      { title: '扩展坞', sku: 'DK-014', category: cats[1] || cats[0], quantity: 0, location: 'A-05', status: '缺货' },
    ],
    crm: [
      { title: '远景科技', company: '远景科技', stage: '沟通中', contact: 'contact@example.com', next_follow_up: '2026-09-24' },
      { title: '星海工作室', company: '星海工作室', stage: '方案中', contact: '13800000000', next_follow_up: '2026-09-25' },
      { title: '青禾教育', company: '青禾教育', stage: '已成交', contact: 'hello@example.com', next_follow_up: '2026-10-02' },
    ],
    event: [
      { title: '产品需求评审', category: cats[0], date: '2026-09-22', location: '3A 会议室', status: '已确认' },
      { title: '技术分享会', category: cats[2] || cats[0], date: '2026-09-25', location: '线上', status: '待确认' },
      { title: '季度复盘', category: cats[0], date: '2026-09-30', location: '多功能厅', status: '已完成' },
    ],
    library: [
      { title: '设计数据密集型应用', author: 'Martin Kleppmann', category: cats[0], status: '已借出', rating: 5 },
      { title: '人月神话', author: 'Fred Brooks', category: cats[0], status: '在库', rating: 4 },
      { title: '系统设计面试', author: 'Alex Xu', category: cats[1] || cats[0], status: '预约中', rating: 5 },
    ],
    custom: [
      { title: '示例记录 A' },
      { title: '示例记录 B' },
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
