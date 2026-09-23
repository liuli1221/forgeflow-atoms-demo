/** Center column: editable implementation plan + live run trace. */
import { el, clear } from './dom.js';
import { formatTime } from '../core/util.js';
import { RUN_STAGES } from '../core/planner.js';

export function renderPlan(container, project, handlers) {
  clear(container);

  if (!project) {
    container.appendChild(el('div', { class: 'card-box' }, [
      el('h3', { text: '没有选中项目' }),
      el('p', { class: 'sub', text: '在左侧新建或选择一个项目后开始。' }),
    ]));
    return;
  }

  const plan = project.pendingPlan;
  const running = project.status === 'running';

  if (!plan && !running) {
    const box = el('div', { class: 'card-box' }, [
      el('h3', { text: project.spec ? '当前应用' : '等待你的第一条需求' }),
      el('p', {
        class: 'sub',
        text: project.spec
          ? `${project.spec.appName} · DeepSeek 应用 · ${project.versions.length} 个版本。继续在左侧输入修改要求即可生成新版本。`
          : '在左侧输入一句话描述，Agent 会先给出实施计划，你批准后才会调用 DeepSeek 生成代码。',
      }),
    ]);
    container.appendChild(box);
    return;
  }

  if (!plan) return;

  if (running) {
    const busy = el('div', { class: 'card-box' }, [
      el('h3', { text: '正在执行计划…' }),
      el('p', { class: 'sub', text: `${plan.appName} · ${plan.steps.length} 个步骤，执行期间输入框已禁用。` }),
    ]);
    const grid = el('div', { class: 'plan-grid' });
    for (const cell of plan.summary) {
      grid.appendChild(el('div', { class: 'plan-cell' }, [
        el('div', { class: 'k', text: cell.label }),
        el('div', { class: 'v', text: String(cell.value) }),
      ]));
    }
    busy.appendChild(grid);
    container.appendChild(busy);
    return;
  }

  const box = el('div', { class: 'card-box' });
  box.appendChild(el('h3', { text: 'DeepSeek 实施计划（待批准）' }));
  box.appendChild(el('p', { class: 'sub', text: `生成于 ${formatTime(plan.createdAt)} · 批准后调用 DeepSeek，失败会自动修复且不会覆盖当前版本` }));

  const grid = el('div', { class: 'plan-grid' });
  for (const cell of plan.summary) {
    grid.appendChild(el('div', { class: 'plan-cell' }, [
      el('div', { class: 'k', text: cell.label }),
      el('div', { class: 'v', text: String(cell.value) }),
    ]));
  }
  box.appendChild(grid);

  if (plan.changes && plan.changes.length) {
    box.appendChild(el('div', { class: 'sub', text: '本次改动：' + plan.changes.join('；') }));
  }

  const steps = el('div', { class: 'plan-steps' });
  plan.steps.forEach((step, i) => {
    steps.appendChild(el('div', { class: 'plan-step' }, [
      el('div', { class: 'n', text: String(i + 1) }),
      el('div', null, [
        el('div', { class: 't', text: step.title }),
        el('div', { class: 'd', text: step.detail }),
      ]),
    ]));
  });
  box.appendChild(steps);

  const chips = el('div', { class: 'field-chips' });
  for (const f of plan.fields) {
    chips.appendChild(el('span', { class: 'field-chip' }, [
      el('b', { text: f.label }),
      document.createTextNode(` ${f.type}${f.required ? ' *' : ''}`),
    ]));
  }
  if (plan.fields && plan.fields.length) box.appendChild(chips);
  box.appendChild(el('p', { class: 'sub', text: '模型只在批准后调用。生成结果必须通过文件完整性、语法、安全、持久化和应用专项契约检查。' }));

  if (plan.notes && plan.notes.length) {
    box.appendChild(el('p', { class: 'sub', text: '备注：' + plan.notes.join(' ') }));
  }

  box.appendChild(el('div', { class: 'plan-actions' }, [
    el('button', {
      class: 'btn primary', type: 'button', text: '批准并执行', disabled: running,
      onclick: () => handlers.onApprove(),
    }),
    el('button', {
      class: 'btn ghost', type: 'button', text: '取消计划', disabled: running,
      onclick: () => handlers.onDiscard(),
    }),
  ]));

  container.appendChild(box);
}

const ICONS = { pending: '·', running: '', done: '✓', failed: '✕', cancelled: '⊘' };

export function renderTrace(container, project, handlers) {
  clear(container);
  if (!project) return;

  const events = project.runEvents || [];
  const box = el('div', { class: 'card-box' });
  box.appendChild(el('h3', { text: '运行轨迹' }));
  box.appendChild(el('p', {
    class: 'sub',
    text: `状态：${project.status}　·　阶段：${RUN_STAGES.map((s) => s.label).join(' → ')}`,
  }));

  const list = el('div', { class: 'trace-list' });
  if (!events.length) {
    list.appendChild(el('div', { class: 'empty-line', text: '还没有运行记录。' }));
  }

  // Collapse events by stage, keeping the latest status of each.
  const latest = new Map();
  for (const evt of events) latest.set(evt.stage, evt);
  const ordered = RUN_STAGES.map((s) => latest.get(s.key)).filter(Boolean);
  const extras = events.filter((e) => !RUN_STAGES.some((s) => s.key === e.stage));

  for (const evt of [...ordered, ...extras]) {
    const icon = evt.status === 'running'
      ? el('span', { class: 'spinner' })
      : el('span', { text: ICONS[evt.status] || '·' });
    list.appendChild(el('div', { class: `trace-item ${evt.status}` }, [
      el('div', { class: 'ico' }, [icon]),
      el('div', null, [
        el('div', { class: 'tl', text: evt.label }),
        evt.detail ? el('div', { class: 'td', text: evt.detail }) : null,
      ]),
      el('div', { class: 'tt', text: formatTime(evt.at) }),
    ]));
  }
  box.appendChild(list);

  if (project.status === 'running') {
    box.appendChild(el('div', { class: 'plan-actions', style: 'margin-top:10px' }, [
      el('button', { class: 'btn danger', type: 'button', text: '取消运行', onclick: () => handlers.onCancel() }),
    ]));
  }
  if (project.status === 'failed') {
    box.appendChild(el('div', { class: 'plan-actions', style: 'margin-top:10px' }, [
      el('button', { class: 'btn primary', type: 'button', text: '重试上一条需求', onclick: () => handlers.onRetry() }),
    ]));
  }

  if (project.checks && project.checks.length) {
    const checks = el('div', { class: 'check-list' });
    for (const c of project.checks) {
      checks.appendChild(el('div', { class: `check-row ${c.status}` }, [
        el('span', { class: 'st', text: c.status.toUpperCase() }),
        el('span', { text: c.label }),
        c.detail ? el('span', { class: 'dt', text: `— ${c.detail}` }) : null,
      ]));
    }
    box.appendChild(el('p', { class: 'sub', style: 'margin-top:10px', text: '最近一次校验结果' }));
    box.appendChild(checks);
  }

  container.appendChild(box);
}
