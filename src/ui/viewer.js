/** Right column: code browser, console log, version history. */
import { el, clear } from './dom.js';
import { formatTime } from '../core/util.js';
import { FILE_ORDER } from '../core/generator/index.js';

function neutralizeAgentCopy(value) {
  return String(value || '')
    .replace(/DeepSeek(?:-[A-Za-z0-9._-]+|\s+(?:LLM|Agent))?/gi, 'AI Agent')
    .replace(/AI Agent-[A-Za-z0-9._-]+/gi, 'AI Agent')
    .replace(/\bLLM\b/gi, 'AI Agent');
}

export function renderFileTabs(container, project, activeFile, onSelect) {
  clear(container);
  const files = (project && project.files) || null;
  for (const name of FILE_ORDER) {
    const disabled = !files || typeof files[name] !== 'string';
    container.appendChild(el('button', {
      class: `file-tab${name === activeFile ? ' active' : ''}`,
      type: 'button',
      text: name,
      disabled,
      onclick: () => onSelect(name),
    }));
  }
}

export function renderCode(preNode, project, activeFile) {
  clear(preNode);
  const files = (project && project.files) || null;
  const code = files && typeof files[activeFile] === 'string' ? files[activeFile] : '尚未生成代码。批准一次计划后，这里会显示 index.html / styles.css / app.js 的真实源码。';
  preNode.appendChild(el('code', { text: code }));
}

export function renderConsole(container, logs) {
  clear(container);
  if (!logs.length) {
    container.appendChild(el('div', { class: 'log-line info' }, [
      el('span', { class: 'lt', text: '--:--:--' }),
      el('span', { class: 'lv', text: 'info' }),
      el('span', { text: '暂无日志。Builder 与预览应用的运行日志会出现在这里。' }),
    ]));
    return;
  }
  for (const line of logs) {
    container.appendChild(el('div', { class: `log-line ${line.level}` }, [
      el('span', { class: 'lt', text: line.time }),
      el('span', { class: 'lv', text: line.level }),
      el('span', { text: neutralizeAgentCopy(line.message) }),
    ]));
  }
  container.scrollTop = container.scrollHeight;
}

export function renderVersions(container, project, handlers) {
  clear(container);
  if (!project || !project.versions.length) {
    container.appendChild(el('div', { class: 'empty-line', text: '还没有版本。每次校验通过的生成都会在这里留下一条记录。' }));
    return;
  }
  const list = [...project.versions].reverse();
  for (const version of list) {
    const isCurrent = version.id === project.currentVersionId;
    container.appendChild(el('div', { class: `version-item${isCurrent ? ' current' : ''}` }, [
      el('div', { class: 'version-head' }, [
        el('span', { class: 'vlabel', text: version.label }),
        el('span', { class: `tagmini${isCurrent ? ' current' : ''}`, text: isCurrent ? '当前' : version.mode === 'modify' ? '增量修改' : '全量生成' }),
        el('span', { class: 'vtime', text: formatTime(version.createdAt) }),
      ]),
      el('div', { class: 'version-body', text: `${version.appName} · ${version.spec.fields.length} 字段 · ${version.spec.layout.view} 视图 · ${version.spec.theme.mode === 'dark' ? '暗色' : '亮色'}` }),
      el('div', { class: 'version-body', text: neutralizeAgentCopy(version.changes && version.changes.length ? `改动：${version.changes.join('；')}` : `需求：${version.prompt || '（无）'}`) }),
      el('div', { class: 'version-actions' }, [
        el('button', { class: 'btn tiny', type: 'button', text: '预览此版本', onclick: () => handlers.onPreview(version.id) }),
        el('button', { class: 'btn tiny', type: 'button', text: '查看代码', onclick: () => handlers.onCode(version.id) }),
        el('button', {
          class: 'btn tiny primary', type: 'button', text: '恢复为当前版本',
          disabled: isCurrent, onclick: () => handlers.onRestore(version.id),
        }),
      ]),
    ]));
  }
}
