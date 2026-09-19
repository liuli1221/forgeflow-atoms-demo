/**
 * Local Agent orchestration (finite state machine).
 *
 * States: idle -> analyzing -> awaiting_approval -> running -> ready | failed | cancelled
 *
 * Everything here is deterministic local computation. There is no network
 * call and no LLM — the "agent" is a parser + planner + generator + validator
 * wired together behind an explicit human approval gate.
 */
import { parsePrompt } from './parser.js';
import { applyModification } from './mutator.js';
import { buildPlan, RUN_STAGES } from './planner.js';
import { generateFiles } from './generator/index.js';
import { validateBundle } from './validator.js';
import { createVersion, nextVersionIndex } from './versions.js';
import { uid, nowIso, clone } from './util.js';

export const AGENT_STATES = ['idle', 'analyzing', 'awaiting_approval', 'running', 'ready', 'failed', 'cancelled'];
export { RUN_STAGES };

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stage 1 — understand the request and produce a plan for human approval.
 *
 * @returns {{ok:boolean, mode:'create'|'modify', spec:object|null, plan:object|null,
 *            analysis:object|null, changes:string[], messages:string[], error:string}}
 */
export function prepareRequest(project, prompt, options = {}) {
  const hasSpec = !!(project && project.spec);
  const messages = [];

  if (typeof prompt !== 'string' || prompt.trim().length < 4) {
    return {
      ok: false, mode: 'create', spec: null, plan: null, analysis: null, changes: [], messages,
      error: '请至少输入 4 个字符来描述你的需求，例如「做一个面试任务管理器，支持优先级、分类筛选和进度统计」。',
    };
  }

  if (hasSpec) {
    const mod = applyModification(project.spec, prompt);
    if (mod.ok) {
      const plan = buildPlan(mod.spec, { confidence: 0.95, notes: mod.notes }, { mode: 'modify', changes: mod.changes, now: options.now });
      messages.push(`识别到 ${mod.changes.length} 处修改：${mod.changes.join('；')}`);
      return { ok: true, mode: 'modify', spec: mod.spec, plan, analysis: { ...(project.analysis || {}), notes: mod.notes }, changes: mod.changes, messages, error: '' };
    }
    // Not a recognised tweak — maybe the user is describing a brand new app.
    const parsed = parsePrompt(prompt, { now: options.now });
    if (parsed.ok && !parsed.analysis.fallback) {
      const spec = { ...parsed.spec, appId: project.spec.appId };
      const plan = buildPlan(spec, parsed.analysis, { mode: 'create', now: options.now });
      messages.push('这条描述看起来是一个全新的应用，将基于它重新生成（历史版本仍可恢复）。');
      return { ok: true, mode: 'create', spec, plan, analysis: parsed.analysis, changes: [], messages, error: '' };
    }
    return {
      ok: false, mode: 'modify', spec: null, plan: null, analysis: null, changes: [], messages,
      error: mod.notes.join(' ') || '没有识别出可执行的修改。',
    };
  }

  const parsed = parsePrompt(prompt, { now: options.now });
  if (!parsed.ok) {
    return { ok: false, mode: 'create', spec: null, plan: null, analysis: parsed.analysis, changes: [], messages, error: parsed.analysis.notes.join(' ') || '无法解析该需求。' };
  }
  const plan = buildPlan(parsed.spec, parsed.analysis, { mode: 'create', now: options.now });
  if (parsed.analysis.fallback) messages.push('未命中已知领域，使用通用模板兜底，你可以继续追加修改要求。');
  return { ok: true, mode: 'create', spec: parsed.spec, plan, analysis: parsed.analysis, changes: [], messages, error: '' };
}

/** Apply the user's manual tweaks made on the plan card before approval. */
export function applyPlanOverrides(spec, overrides = {}) {
  const next = clone(spec);
  if (typeof overrides.appName === 'string' && overrides.appName.trim()) {
    next.appName = overrides.appName.trim().slice(0, 40);
  }
  if (overrides.view) next.layout.view = overrides.view;
  if (overrides.themeMode) next.theme.mode = overrides.themeMode;
  ['showSearch', 'showFilters', 'showStats'].forEach((flag) => {
    if (typeof overrides[flag] === 'boolean') next.layout[flag] = overrides[flag];
  });
  if (!next.layout.showFilters) next.filters = [];
  return next;
}

function event(stage, status, detail) {
  const meta = RUN_STAGES.find((s) => s.key === stage) || { label: stage };
  return { id: uid('evt'), stage, status, label: meta.label, detail: detail || '', at: nowIso() };
}

/**
 * Stage 2 — execute the approved plan.
 *
 * @param {object} ctx { project, spec, mode, changes, prompt }
 * @param {object} hooks { onEvent(evt), sleep(ms), shouldCancel() }
 */
export async function executeRun(ctx, hooks = {}) {
  const onEvent = hooks.onEvent || (() => {});
  const sleep = hooks.sleep || defaultSleep;
  const shouldCancel = hooks.shouldCancel || (() => false);
  const tick = hooks.tick === undefined ? 260 : hooks.tick;
  const events = [];

  const emit = (stage, status, detail) => {
    const evt = event(stage, status, detail);
    events.push(evt);
    onEvent(evt);
    return evt;
  };

  const cancelled = (stage) => {
    emit(stage, 'cancelled', '用户取消了本次运行');
    return { ok: false, cancelled: true, events, error: '已取消', files: null, version: null, checks: [] };
  };

  // analyze
  emit('analyze', 'running');
  await sleep(tick);
  if (shouldCancel()) return cancelled('analyze');
  emit('analyze', 'done', ctx.mode === 'modify'
    ? `增量修改：${(ctx.changes || []).join('；') || '无'}`
    : `领域 ${ctx.spec.domain} · ${ctx.spec.fields.length} 个字段`);

  // plan
  emit('plan', 'running');
  await sleep(tick);
  if (shouldCancel()) return cancelled('plan');
  emit('plan', 'done', `${ctx.spec.fields.length} 字段 / ${ctx.spec.filters.length} 筛选 / ${ctx.spec.metrics.length} 指标`);

  // generate
  emit('generate', 'running');
  let files;
  try {
    files = generateFiles(ctx.spec);
  } catch (err) {
    emit('generate', 'failed', String(err && err.message));
    return { ok: false, cancelled: false, events, error: '代码生成失败：' + String(err && err.message), files: null, version: null, checks: [] };
  }
  await sleep(tick);
  if (shouldCancel()) return cancelled('generate');
  const sizes = Object.entries(files).map(([name, content]) => `${name} ${(content.length / 1024).toFixed(1)}KB`);
  emit('generate', 'done', sizes.join(' · '));

  // validate
  emit('validate', 'running');
  const report = validateBundle(ctx.spec, files);
  await sleep(tick);
  if (!report.ok) {
    emit('validate', 'failed', report.errors.join('；'));
    return { ok: false, cancelled: false, events, error: '校验未通过，已保留上一个版本：' + report.errors.join('；'), files, version: null, checks: report.checks };
  }
  const passed = report.checks.filter((c) => c.status === 'pass').length;
  emit('validate', 'done', `${passed}/${report.checks.length} 项检查通过`);
  if (shouldCancel()) return cancelled('validate');

  // save version
  emit('save', 'running');
  const index = nextVersionIndex(ctx.project && ctx.project.versions);
  const version = createVersion({
    spec: ctx.spec,
    files,
    prompt: ctx.prompt || '',
    changes: ctx.changes || [],
    mode: ctx.mode,
    index,
  });
  await sleep(tick);
  emit('save', 'done', `已保存 ${version.label}`);

  // ready
  emit('ready', 'running');
  await sleep(tick);
  emit('ready', 'done', '预览已加载，可直接操作数据');

  return { ok: true, cancelled: false, events, error: '', files, version, checks: report.checks };
}
