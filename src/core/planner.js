/**
 * Plan builder: AppSpec + analysis -> a human-checkable implementation plan.
 * The plan is what the user approves before anything is generated.
 */

export const RUN_STAGES = [
  { key: 'analyze', label: '理解需求', hint: '解析自然语言，抽取领域与特性' },
  { key: 'plan', label: '生成实施计划', hint: '结构化 AppSpec + 待办步骤' },
  { key: 'generate', label: '生成源码文件', hint: 'index.html / styles.css / app.js' },
  { key: 'validate', label: '确定性校验', hint: 'schema + 语法 + 安全约束' },
  { key: 'save', label: '保存版本', hint: '写入版本历史与 localStorage' },
  { key: 'ready', label: '加载预览', hint: '注入 sandbox iframe' },
];

const VIEW_LABEL = { cards: '卡片', table: '表格', list: '列表' };
const DOMAIN_LABEL = {
  task: '任务型（task）',
  habit: '习惯打卡型（habit）',
  budget: '收支记账型（budget）',
  feedback: '反馈收集型（feedback）',
  inventory: '库存管理型（inventory）',
  crm: '客户关系型（crm）',
  event: '活动日程型（event）',
  library: '图书借阅型（library）',
  custom: '自定义 Schema（custom）',
  generic: '通用型（generic 兜底）',
};

export function buildPlan(spec, analysis, options = {}) {
  const mode = options.mode === 'modify' ? 'modify' : 'create';
  const changes = options.changes || [];

  const summary = [
    { label: '应用名称', value: spec.appName },
    { label: '识别领域', value: DOMAIN_LABEL[spec.domain] || spec.domain },
    { label: '置信度', value: analysis && analysis.confidence ? `${Math.round(analysis.confidence * 100)}%` : '—' },
    { label: '数据实体', value: spec.entityName },
    { label: '字段数量', value: `${spec.fields.length} 个` },
    { label: '默认视图', value: VIEW_LABEL[spec.layout.view] || spec.layout.view },
    { label: '主题', value: spec.theme.mode === 'dark' ? '暗色' : '亮色' },
  ];

  const modules = [
    spec.layout.showSearch ? '搜索' : null,
    spec.layout.showFilters ? `筛选（${spec.filters.length} 个维度）` : null,
    spec.layout.showStats ? `统计（${spec.metrics.length} 个指标）` : null,
    '增删改查',
    '本地持久化',
  ].filter(Boolean);

  const steps = [
    {
      key: 'spec',
      title: mode === 'modify' ? '在现有 AppSpec 上应用增量修改' : '构建 AppSpec 数据契约',
      detail:
        mode === 'modify' && changes.length
          ? changes.join('；')
          : `${spec.fields.length} 个字段：${spec.fields.map((f) => f.label).join('、')}`,
    },
    { key: 'ui', title: '生成界面骨架与主题', detail: `${VIEW_LABEL[spec.layout.view] || spec.layout.view}视图 · ${spec.theme.mode === 'dark' ? '暗色' : '亮色'}主题 · 主色 ${spec.theme.accent}` },
    { key: 'logic', title: '生成交互逻辑', detail: modules.join(' / ') },
    { key: 'data', title: '注入示例数据并打通持久化', detail: `${spec.seedItems.length} 条示例数据，刷新后保留用户数据` },
    { key: 'verify', title: '运行确定性校验', detail: 'AppSpec schema、HTML 结构、JS 语法与安全约束' },
  ];

  return {
    mode,
    appName: spec.appName,
    summary,
    modules,
    steps,
    changes,
    fields: spec.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required })),
    notes: (analysis && analysis.notes) || [],
    createdAt: options.now || new Date().toISOString(),
  };
}
