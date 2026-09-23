import { uid, nowIso } from './util.js';

function inferName(prompt) {
  const text = String(prompt || 'AI 生成应用').trim();
  if (/计算器|calculator/i.test(text)) return '智能计算器';
  if (/贪吃蛇|snake/i.test(text)) return '经典贪吃蛇';
  return text
    .replace(/^(请|帮我|给我|我想要|我需要|做|生成|创建|开发|写|build|create|make)\s*/i, '')
    .split(/[，。,.；;：:]/)[0]
    .slice(0, 40) || 'AI 生成应用';
}

export function prepareLlmRequest(project, prompt, options = {}) {
  const previous = project && project.spec;
  const mode = previous ? 'modify' : 'create';
  const appName = previous && previous.appName ? previous.appName : inferName(prompt);
  const spec = {
    specVersion: 1,
    appId: previous && previous.appId ? previous.appId : uid('app'),
    appName,
    tagline: '由 AI Agent 生成的真实交互应用',
    domain: 'custom',
    entityName: '应用状态',
    theme: { mode: 'light', accent: '#4f6bed' },
    layout: { view: 'cards', showSearch: false, showStats: false, showFilters: false },
    fields: [{ key: 'state', label: '运行状态', type: 'text', required: false, primary: true }],
    filters: [],
    metrics: [],
    seedItems: [],
    sourcePrompt: String(prompt || ''),
    engine: 'ai-agent',
    appType: 'custom',
  };

  const plan = {
    engine: 'ai-agent',
    mode,
    appName,
    summary: [
      { label: '应用名称', value: appName },
      { label: '生成方式', value: 'AI Agent' },
      { label: '生成模式', value: mode === 'modify' ? '基于当前代码增量重写' : '从需求生成完整应用' },
      { label: '输出文件', value: 'index.html / styles.css / app.js' },
      { label: '失败策略', value: '确定性校验 + 最多 2 次自动修复' },
    ],
    modules: ['智能生成', '代码生成', '安全校验', '自动修复', 'sandbox 预览'],
    steps: [
      { key: 'analyze', title: '理解应用需求', detail: '统一分析领域、数据结构与交互行为' },
      { key: 'generate', title: '智能生成完整源码', detail: '输出三个无外部依赖的浏览器文件' },
      { key: 'validate', title: '执行确定性校验', detail: 'HTML 结构、JavaScript 语法、安全约束与应用专项契约' },
      { key: 'repair', title: '失败时自动修复', detail: '将校验错误和上一版代码反馈给模型，最多修复 2 次' },
      { key: 'save', title: '保存 READY 版本并加载预览', detail: '失败结果不覆盖当前可用版本' },
    ],
    changes: mode === 'modify' ? [String(prompt)] : [],
    fields: [],
    notes: options.available === false ? ['当前智能生成服务不可用；批准时会明确失败，不会回退成通用 CRUD。'] : [],
    createdAt: options.now || nowIso(),
  };

  return {
    ok: true,
    engine: 'ai-agent',
    mode,
    spec,
    plan,
    analysis: { confidence: 1, fallback: false, engine: 'ai-agent', notes: plan.notes },
    changes: plan.changes,
    messages: ['所有自然语言创建与修改统一走 AI Agent；确定性代码负责校验、安全、版本与持久化。'],
    error: '',
  };
}
