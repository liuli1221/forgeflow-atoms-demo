/** Left column: project list, chat log, suggestion chips. */
import { el, clear } from './dom.js';
import { formatTime } from '../core/util.js';

function neutralizeAgentCopy(value) {
  return String(value || '')
    .replace(/DeepSeek(?:\s+LLM|\s+Agent)?/gi, 'AI Agent')
    .replace(/\bLLM\b/gi, 'AI Agent');
}

export function renderProjects(container, state, handlers) {
  clear(container);
  if (!state.projects.length) {
    container.appendChild(el('li', { class: 'empty-line', text: '还没有项目，点右上角「+ 新建」。' }));
    return;
  }
  for (const project of state.projects) {
    const active = project.id === state.activeProjectId;
    const item = el('li', {
      class: `project-item${active ? ' active' : ''}`,
      onclick: () => handlers.onSelect(project.id),
      title: project.name,
    }, [
      el('span', { class: 'pname', text: project.name }),
      el('span', { class: 'pmeta', text: `v${project.versions.length}` }),
      el('button', {
        class: 'btn tiny pdel',
        type: 'button',
        text: '删除',
        onclick: (ev) => { ev.stopPropagation(); handlers.onDelete(project.id); },
      }),
    ]);
    container.appendChild(item);
  }
}

export function renderChat(container, project) {
  clear(container);
  if (!project) {
    container.appendChild(el('div', { class: 'msg system', text: '请选择或新建一个项目。' }));
    return;
  }
  if (!project.messages.length) {
    container.appendChild(el('div', {
      class: 'msg system',
      text: '空项目。在下面描述你想要的小应用，例如「做一个面试任务管理器，支持优先级、分类筛选和进度统计」。',
    }));
  }
  for (const msg of project.messages) {
    container.appendChild(el('div', { class: `msg ${msg.role}${msg.kind === 'error' ? ' error' : ''}` }, [
      document.createTextNode(msg.role === 'agent' ? neutralizeAgentCopy(msg.text) : msg.text),
      el('span', { class: 'msg-time', text: formatTime(msg.at) }),
    ]));
  }
  container.scrollTop = container.scrollHeight;
}

const NEW_PROJECT_SUGGESTIONS = [
  '做一个面试任务管理器，支持优先级、分类筛选和进度统计',
  '做一个习惯打卡应用，记录连续天数和每周目标',
  '做一个求职开销记账本，按分类统计收支',
  '做一个面试反馈收集表，带评分和处理状态',
];

const FOLLOW_UP_SUGGESTIONS = [
  '增加优先级',
  '切换暗色主题',
  '改成表格视图',
  '增加负责人字段',
  '去掉统计',
];

export function renderSuggestions(container, project, onPick) {
  clear(container);
  const list = project && project.spec ? FOLLOW_UP_SUGGESTIONS : NEW_PROJECT_SUGGESTIONS;
  for (const text of list) {
    container.appendChild(el('button', {
      class: 'chip', type: 'button', text, onclick: () => onPick(text),
    }));
  }
}
