/**
 * Preset demo project: "面试准备计划器".
 *
 * Built by running the real pipeline (parse -> plan -> generate -> validate),
 * so what you see on first open is exactly what the agent would have produced
 * for that prompt — not a hand-written fixture.
 */
import { parsePrompt } from './parser.js';
import { buildPlan, RUN_STAGES } from './planner.js';
import { generateFiles } from './generator/index.js';
import { validateBundle } from './validator.js';
import { createVersion } from './versions.js';
import { createProject } from './storage.js';
import { uid, nowIso } from './util.js';

export const SEED_PROMPT = '做一个面试准备计划器，支持优先级、分类筛选、截止日期和进度统计';

export function buildSeedProject(options = {}) {
  const now = options.now || nowIso();
  const parsed = parsePrompt(SEED_PROMPT, { now, appName: '面试准备计划器' });
  if (!parsed.ok) return null;

  const spec = parsed.spec;
  const plan = buildPlan(spec, parsed.analysis, { mode: 'create', now });
  const files = generateFiles(spec);
  const report = validateBundle(spec, files);
  if (!report.ok) return null;

  const version = createVersion({ spec, files, prompt: SEED_PROMPT, mode: 'create', index: 1, now });

  const project = createProject('面试准备计划器', { id: options.id, now });
  project.messages = [
    { id: uid('msg'), role: 'system', text: '预置演示项目：这条需求已经跑完一次完整流程，你可以直接预览，也可以继续提修改要求。', at: now },
    { id: uid('msg'), role: 'user', text: SEED_PROMPT, at: now },
    {
      id: uid('msg'),
      role: 'agent',
      text: `已生成「${spec.appName}」：${spec.fields.length} 个字段、${spec.filters.length} 个筛选维度、${spec.metrics.length} 个统计指标。试试「增加负责人字段」「切换暗色主题」「改成表格视图」。`,
      at: now,
    },
  ];
  project.spec = spec;
  project.files = files;
  project.analysis = parsed.analysis;
  project.plan = plan;
  project.pendingPlan = null;
  project.status = 'ready';
  project.versions = [version];
  project.currentVersionId = version.id;
  project.runEvents = RUN_STAGES.map((stage) => ({
    id: uid('evt'),
    stage: stage.key,
    status: 'done',
    label: stage.label,
    detail: stage.hint,
    at: now,
  }));
  project.checks = report.checks;
  return project;
}
