import { RUN_STAGES } from './planner.js';
import { createVersion, nextVersionIndex } from './versions.js';
import { uid, nowIso } from './util.js';

function event(stage, status, detail, label) {
  const meta = RUN_STAGES.find((item) => item.key === stage);
  return { id: uid('evt'), stage, status, label: label || (meta ? meta.label : stage), detail: detail || '', at: nowIso() };
}

export async function executeLlmRun(ctx, hooks = {}) {
  const onEvent = hooks.onEvent || (() => {});
  const shouldCancel = hooks.shouldCancel || (() => false);
  const generate = hooks.generate;
  const events = [];
  const emit = (stage, status, detail, label) => {
    const value = event(stage, status, detail, label);
    events.push(value);
    onEvent(value);
    return value;
  };
  if (typeof generate !== 'function') return { ok: false, cancelled: false, events, error: '缺少 LLM generate 实现。', files: null, version: null, checks: [] };

  emit('analyze', 'running', '正在识别应用行为与交互边界');
  if (shouldCancel()) return { ok: false, cancelled: true, events, error: '已取消', files: null, version: null, checks: [] };
  emit('analyze', 'done', '使用 DeepSeek 处理开放式应用需求');
  emit('plan', 'running');
  emit('plan', 'done', '完整源码 → 校验 → 自动修复 → READY 版本');
  emit('generate', 'running', '正在调用 DeepSeek，首次生成可能需要几十秒');

  let response;
  try {
    const previousArtifact = ctx.project && ctx.project.files ? {
      appName: ctx.project.spec && ctx.project.spec.appName || ctx.spec.appName,
      appType: ctx.project.spec && ctx.project.spec.appType || 'custom',
      summary: ctx.project.spec && ctx.project.spec.tagline || '现有 ForgeFlow 应用',
      acceptanceCriteria: ctx.project.spec && ctx.project.spec.acceptanceCriteria || [],
      files: ctx.project.files,
    } : null;
    response = await generate({
      prompt: ctx.prompt,
      mode: ctx.mode,
      appId: ctx.spec.appId,
      previousArtifact,
    });
  } catch (error) {
    const cancelled = error && (error.name === 'AbortError' || error.cancelled);
    emit('generate', cancelled ? 'cancelled' : 'failed', String(error && error.message || error));
    return { ok: false, cancelled, events, error: cancelled ? '已取消' : `LLM 请求失败：${String(error && error.message || error)}`, files: null, version: null, checks: [] };
  }

  if (!response.ok) {
    emit('generate', response.cancelled ? 'cancelled' : 'failed', response.error || 'DeepSeek 生成失败');
    return { ok: false, cancelled: !!response.cancelled, events, error: response.error || 'DeepSeek 生成失败', files: null, version: null, checks: response.checks || [] };
  }

  const attempts = Array.isArray(response.attempts) ? response.attempts : [];
  emit('generate', 'done', `${response.model} · ${attempts.length} 次模型调用 · 三个源码文件`);
  attempts.filter((item) => !item.ok).forEach((item, index) => {
    emit(`repair-${index + 1}`, 'done', (item.errors || []).join('；'), `自动修复 ${index + 1}`);
  });
  emit('validate', 'running');
  const passed = (response.checks || []).filter((item) => item.status === 'pass').length;
  emit('validate', 'done', `${passed}/${(response.checks || []).length} 项检查通过`);
  if (shouldCancel()) return { ok: false, cancelled: true, events, error: '已取消', files: null, version: null, checks: response.checks || [] };

  emit('save', 'running');
  const version = createVersion({
    spec: response.spec,
    files: response.files,
    prompt: ctx.prompt,
    changes: ctx.mode === 'modify' ? [response.artifact.summary] : [],
    mode: ctx.mode,
    index: nextVersionIndex(ctx.project && ctx.project.versions),
  });
  emit('save', 'done', `已保存 ${version.label}`);
  emit('ready', 'running');
  emit('ready', 'done', 'DeepSeek 生成应用已加载到 sandbox');
  return { ok: true, cancelled: false, events, error: '', files: response.files, version, checks: response.checks || [], model: response.model, attempts, usage: response.usage };
}
