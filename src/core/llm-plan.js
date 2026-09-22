import { uid, nowIso } from './util.js';

const BEHAVIORAL_APP = /计算器|贪吃蛇|俄罗斯方块|扫雷|游戏|番茄钟|倒计时|计时器|秒表|画板|白板|播放器|转换器|抽奖|问答|答题|测验|calculator|snake|timer|game|canvas|quiz/i;

function inferName(prompt) {
  const text = String(prompt || 'AI 生成应用').trim();
  if (/计算器|calculator/i.test(text)) return '智能计算器';
  if (/贪吃蛇|snake/i.test(text)) return '经典贪吃蛇';
  return text
    .replace(/^(请|帮我|给我|我想要|我需要|做|生成|创建|开发|写|build|create|make)\s*/i, '')
    .split(/[，。,.；;：:]/)[0]
    .slice(0, 40) || 'AI 生成应用';
}

export function shouldUseLlm(project, prompt, localResult) {
  if (project && project.spec && project.spec.engine === 'deepseek') return true;
  if (BEHAVIORAL_APP.test(String(prompt || ''))) return true;
  return !!(localResult && localResult.analysis && localResult.analysis.fallback);
}

export function prepareLlmRequest(project, prompt, options = {}) {
  const previous = project && project.spec;
  const mode = previous ? 'modify' : 'create';
  const appName = previous && previous.engine === 'deepseek' ? previous.appName : inferName(prompt);
  const spec = {
    specVersion: 1,
    appId: previous && previous.appId ? previous.appId : uid('app'),
    appName,
    tagline: '由 DeepSeek 生成的真实交互应用',
    domain: 'custom',
    entityName: '应用状态',
    theme: { mode: 'light', accent: '#4f6bed' },
    layout: { view: 'cards', showSearch: false, showStats: false, showFilters: false },
    fields: [{ key: 'state', label: '运行状态', type: 'text', required: false, primary: true }],
    filters: [],
    metrics: [],
    seedItems: [],
    sourcePrompt: String(prompt || ''),
    engine: 'deepseek',
    appType: 'custom',
  };

  const plan = {
    engine: 'deepseek',
    mode,
    appName,
    summary: [
      { label: '应用名称', value: appName },
      { label: '生成引擎', value: 'DeepSeek LLM' },
      { label: '生成模式', value: mode === 'modify' ? '基于当前代码增量重写' : '从需求生成完整应用' },
      { label: '输出文件', value: 'index.html / styles.css / app.js' },
      { label: '失败策略', value: '确定性校验 + 最多 2 次自动修复' },
    ],
    modules: ['真实 LLM', '代码生成', '安全校验', '自动修复', 'sandbox 预览'],
    steps: [
      { key: 'analyze', title: '理解开放式应用需求', detail: '识别交互行为，不把游戏或工具降级为 CRUD' },
      { key: 'generate', title: '调用 DeepSeek 生成完整源码', detail: '输出三个无外部依赖的浏览器文件' },
      { key: 'validate', title: '执行确定性校验', detail: 'HTML 结构、JavaScript 语法、安全约束与应用专项契约' },
      { key: 'repair', title: '失败时自动修复', detail: '将校验错误和上一版代码反馈给模型，最多修复 2 次' },
      { key: 'save', title: '保存 READY 版本并加载预览', detail: '失败结果不覆盖当前可用版本' },
    ],
    changes: mode === 'modify' ? [String(prompt)] : [],
    fields: [],
    notes: options.available === false ? ['当前未连接可用的 DeepSeek 服务；批准时会明确失败，不会回退成通用 CRUD。'] : [],
    createdAt: options.now || nowIso(),
  };

  return {
    ok: true,
    engine: 'deepseek',
    mode,
    spec,
    plan,
    analysis: { confidence: 1, fallback: false, engine: 'deepseek', notes: plan.notes },
    changes: plan.changes,
    messages: ['该需求将由真实 DeepSeek LLM 生成代码，不使用 generic CRUD 兜底。'],
    error: '',
  };
}
