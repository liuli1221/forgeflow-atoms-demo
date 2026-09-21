/**
 * ForgeFlow builder controller.
 *
 * Wires the pure core (parser / planner / generator / validator / versions /
 * storage) to the DOM. All state transitions go through the store so they are
 * persisted to localStorage and survive a refresh.
 */
import { $, copyText, downloadText, readFileAsText } from './dom.js';
import { initToast, toast } from './toast.js';
import { createAppStore } from './store.js';
import { createPreviewBridge } from './preview-bridge.js';
import { createSyncClient } from './sync-client.js';
import { renderProjects, renderChat, renderSuggestions } from './sidebar.js';
import { renderPlan, renderTrace } from './plan-view.js';
import { renderFileTabs, renderCode, renderConsole, renderVersions } from './viewer.js';
import { prepareRequest, executeRun, applyPlanOverrides } from '../core/agent.js';
import { restoreVersion, findVersion, appendVersion } from '../core/versions.js';
import { buildSeedProject } from '../core/seed.js';
import { buildExportPayload, parseImport, dedupeProjectId, collectAppIds } from '../core/storage.js';
import { uid, nowIso } from '../core/util.js';

const store = createAppStore();
const syncClient = createSyncClient();
const SYNC_BACKUP_KEY = 'forgeflow.v1.pre_sync_backup';

const ui = {};
const logs = [];
let activeFile = 'index.html';
let activeTab = 'preview';
let cancelRequested = false;
let previewVersionId = null;
let loadedPreviewKey = '';
let bridge = null;
let syncAvailable = false;
let syncBusy = false;

/* ------------------------------------------------------------- logging */
function log(level, message) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  logs.push({ level, message, time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` });
  if (logs.length > 300) logs.splice(0, logs.length - 300);
  if (activeTab === 'console') renderConsole(ui.consoleView, logs);
}

/* --------------------------------------------------------------- state */
function project() {
  return store.activeProject();
}

function mutateProject(fn, options) {
  const id = store.getState().activeProjectId;
  store.update((s) => {
    const p = s.projects.find((x) => x.id === id);
    if (p) {
      fn(p);
      p.updatedAt = nowIso();
    }
  }, options);
}

function pushMessage(role, text, kind) {
  mutateProject((p) => {
    p.messages.push({ id: uid('msg'), role, text, at: nowIso(), kind });
    if (p.messages.length > 200) p.messages.splice(0, p.messages.length - 200);
  });
}

/* -------------------------------------------------------------- render */
function render() {
  const state = store.getState();
  const p = project();

  renderProjects(ui.projectList, state, {
    onSelect: selectProject,
    onDelete: deleteProject,
  });

  ui.projectTitle.textContent = p ? `${p.name}（${p.versions.length} 个版本）` : '未选择项目';
  ui.agentState.textContent = p ? p.status : 'idle';
  ui.agentState.dataset.state = p ? p.status : 'idle';

  renderChat(ui.chatLog, p);
  renderSuggestions(ui.suggestions, p, (text) => {
    ui.promptInput.value = text;
    ui.promptInput.focus();
  });

  renderPlan(ui.planPanel, p, {
    onApprove: approvePlan,
    onDiscard: discardPlan,
  });
  renderTrace(ui.tracePanel, p, {
    onCancel: cancelRun,
    onRetry: retryLast,
  });

  renderFileTabs(ui.fileTabs, viewedProject(), activeFile, (name) => {
    activeFile = name;
    render();
  });
  renderCode(ui.codeView, viewedProject(), activeFile);
  renderVersions(ui.versionList, p, {
    onPreview: (id) => { previewVersionId = id; switchTab('preview'); render(); toast('正在预览历史版本', 'info'); },
    onCode: (id) => { previewVersionId = id; switchTab('code'); render(); },
    onRestore: doRestore,
  });
  renderConsole(ui.consoleView, logs);

  const busy = !!p && p.status === 'running';
  ui.promptInput.disabled = busy;
  ui.btnSend.disabled = busy || !p;
  ui.composerHint.textContent = busy
    ? 'Agent 正在执行，请稍候或点击「取消运行」。'
    : p && p.spec
      ? '继续输入修改要求，例如「增加优先级」「切换暗色主题」。'
      : '描述你想要的小应用，Agent 会先给出计划。';

  syncPreview();
}

/** Which project/version supplies the files shown in preview + code tabs. */
function viewedProject() {
  const p = project();
  if (!p) return null;
  if (previewVersionId) {
    const v = findVersion(p.versions, previewVersionId);
    if (v) return { ...p, spec: v.spec, files: v.files };
  }
  return p;
}

function syncPreview() {
  const view = viewedProject();
  if (!view || !view.files) {
    if (loadedPreviewKey !== '') {
      bridge.clear();
      loadedPreviewKey = '';
    }
    ui.previewLabel.textContent = '';
    return;
  }
  const key = `${view.id}:${previewVersionId || view.currentVersionId}`;
  ui.previewLabel.textContent = previewVersionId
    ? `预览历史版本 ${(findVersion(view.versions, previewVersionId) || {}).label || ''} · ${view.spec.appName}`
    : `当前版本 · ${view.spec.appName}`;
  if (key !== loadedPreviewKey) {
    bridge.load(view.files, view.spec);
    loadedPreviewKey = key;
  }
}

/* ------------------------------------------------------------- actions */
function selectProject(id) {
  previewVersionId = null;
  store.update((s) => { s.activeProjectId = id; }, { immediate: true });
  render();
}

function deleteProject(id) {
  const p = store.getProject(id);
  if (!p) return;
  if (p.status === 'running') return toast('运行中，无法删除项目', 'warn');
  if (ui.pendingDeleteProject !== id) {
    ui.pendingDeleteProject = id;
    toast(`再点一次「删除」以确认删除「${p.name}」`, 'warn');
    setTimeout(() => { if (ui.pendingDeleteProject === id) ui.pendingDeleteProject = null; }, 4000);
    return;
  }
  ui.pendingDeleteProject = null;
  store.removeProject(id);
  previewVersionId = null;
  loadedPreviewKey = '';
  log('info', `项目已删除：${p.name}`);
  toast('项目已删除', 'ok');
  render();
}

function newProject(name) {
  const p = store.addProject(name || `新项目 ${store.getState().projects.length + 1}`);
  previewVersionId = null;
  log('info', `新建项目：${p.name}`);
  render();
  ui.promptInput.focus();
  return p;
}

async function submitPrompt(text) {
  const p = project();
  if (!p) return toast('请先新建一个项目', 'warn');
  if (p.status === 'running') return toast('当前有运行中的任务', 'warn');

  const prompt = String(text || '').trim();
  if (!prompt) {
    toast('请输入需求描述', 'warn');
    ui.promptInput.focus();
    return;
  }

  pushMessage('user', prompt);
  previewVersionId = null;

  const result = prepareRequest(p, prompt);
  if (!result.ok) {
    pushMessage('agent', result.error, 'error');
    log('warn', `解析失败：${result.error}`);
    mutateProject((proj) => { proj.status = 'idle'; });
    render();
    return;
  }

  mutateProject((proj) => {
    proj.pendingPlan = result.plan;
    proj.pendingSpec = result.spec;
    proj.pendingPrompt = prompt;
    proj.pendingMode = result.mode;
    proj.pendingChanges = result.changes;
    proj.lastPrompt = prompt;
    proj.analysis = result.analysis;
    proj.status = 'awaiting_approval';
    if (proj.name.startsWith('新项目') && result.mode === 'create') proj.name = result.spec.appName;
  });

  const extra = result.messages.length ? `\n${result.messages.join('\n')}` : '';
  pushMessage('agent', `已生成${result.mode === 'modify' ? '增量修改' : '实施'}计划，请在中间栏检查后点击「批准并执行」。${extra}`);
  log('info', `计划就绪：${result.plan.appName}（${result.mode}）`);
  render();
  setMobileView('plan');
}

async function approvePlan(overrides) {
  const p = project();
  if (!p || !p.pendingSpec) return;
  if (p.status === 'running') return;

  const spec = applyPlanOverrides(p.pendingSpec, overrides);
  cancelRequested = false;

  mutateProject((proj) => {
    proj.status = 'running';
    proj.runEvents = [];
    proj.checks = null;
  });
  render();
  log('info', `开始执行：${spec.appName}`);

  const result = await executeRun(
    { project: p, spec, mode: p.pendingMode, changes: p.pendingChanges || [], prompt: p.pendingPrompt },
    {
      onEvent: (evt) => {
        mutateProject((proj) => {
          const i = proj.runEvents.findIndex((e) => e.stage === evt.stage);
          if (i >= 0) proj.runEvents[i] = evt;
          else proj.runEvents.push(evt);
        }, { silent: true });
        renderTrace(ui.tracePanel, project(), { onCancel: cancelRun, onRetry: retryLast });
        if (evt.status !== 'running') log(evt.status === 'failed' ? 'error' : 'info', `[${evt.stage}] ${evt.label} ${evt.detail || ''}`.trim());
      },
      shouldCancel: () => cancelRequested,
    }
  );

  if (result.cancelled) {
    mutateProject((proj) => { proj.status = 'awaiting_approval'; });
    pushMessage('agent', '已取消本次运行，计划仍然保留，可以修改后重新批准。', 'error');
    toast('已取消运行', 'warn');
    render();
    return;
  }

  if (!result.ok) {
    mutateProject((proj) => {
      proj.status = 'failed';
      proj.checks = result.checks;
    });
    pushMessage('agent', `执行失败：${result.error}\n当前版本未被覆盖，可以点击「重试上一条需求」或调整描述。`, 'error');
    log('error', `执行失败：${result.error}`);
    toast('生成失败，已保留上一个版本', 'error');
    render();
    return;
  }

  mutateProject((proj) => {
    proj.spec = result.version.spec;
    proj.files = result.version.files;
    proj.versions = appendVersion(proj.versions, result.version);
    proj.currentVersionId = result.version.id;
    proj.status = 'ready';
    proj.checks = result.checks;
    proj.pendingPlan = null;
    proj.pendingSpec = null;
    proj.pendingChanges = [];
    if (proj.name.startsWith('新项目')) proj.name = result.version.spec.appName;
  }, { immediate: true });

  const changed = result.version.changes.length ? `（${result.version.changes.join('；')}）` : '';
  pushMessage('agent', `${result.version.label} 已保存${changed}。右侧预览已刷新，数据会自动持久化；可以继续说「增加xx字段」「切换暗色主题」。`);
  toast(`${result.version.label} 保存成功`, 'ok');
  log('info', `版本保存：${result.version.label}`);
  previewVersionId = null;
  render();
  switchTab('preview');
  setMobileView('viewer');
}

function discardPlan() {
  mutateProject((p) => {
    p.pendingPlan = null;
    p.pendingSpec = null;
    p.status = p.spec ? 'ready' : 'idle';
  });
  pushMessage('agent', '计划已取消，没有任何文件被修改。');
  toast('计划已取消', 'info');
  render();
}

function cancelRun() {
  cancelRequested = true;
  log('warn', '收到取消请求，将在当前阶段结束后停止。');
  toast('正在取消…', 'warn');
}

function retryLast() {
  const p = project();
  if (!p || !p.lastPrompt) return toast('没有可重试的需求', 'warn');
  mutateProject((proj) => { proj.status = 'idle'; proj.runEvents = []; });
  submitPrompt(p.lastPrompt);
}

function doRestore(versionId) {
  const p = project();
  if (!p) return;
  const result = restoreVersion(p, versionId);
  if (!result.ok) {
    toast(result.error, 'error');
    log('error', result.error);
    return;
  }
  mutateProject((proj) => {
    proj.spec = result.project.spec;
    proj.files = result.project.files;
    proj.currentVersionId = result.project.currentVersionId;
    proj.status = 'ready';
    proj.pendingPlan = null;
    proj.pendingSpec = null;
  }, { immediate: true });
  previewVersionId = null;
  pushMessage('agent', `已恢复到 ${result.version.label}，后续修改将基于这个版本继续。`);
  toast(`已恢复 ${result.version.label}`, 'ok');
  log('info', `版本恢复：${result.version.label}`);
  render();
  switchTab('preview');
}

/* ------------------------------------------------------- import/export */
function exportProject() {
  const p = project();
  if (!p) return toast('没有可导出的项目', 'warn');
  const appData = store.storage.collectAppData(collectAppIds(p));
  const payload = buildExportPayload(p, appData);
  const safeName = p.name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40) || 'forgeflow-project';
  downloadText(`${safeName}.forgeflow.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  toast('项目 JSON 已导出', 'ok');
  log('info', `导出项目：${p.name}（${p.versions.length} 个版本，${Object.keys(appData).length} 份应用数据）`);
}

async function importProjectFile(file) {
  if (!file) return;
  try {
    const text = await readFileAsText(file);
    const parsed = parseImport(text);
    if (!parsed.ok) {
      toast(parsed.error, 'error');
      log('error', `导入失败：${parsed.error}`);
      return;
    }
    const existingIds = store.getState().projects.map((x) => x.id);
    const imported = dedupeProjectId(parsed.project, existingIds);
    store.update((s) => {
      s.projects.push(imported);
      s.activeProjectId = imported.id;
    }, { immediate: true });
    for (const [appId, data] of Object.entries(parsed.appData)) {
      store.storage.setAppData(appId, data);
    }
    previewVersionId = null;
    loadedPreviewKey = '';
    toast(`已导入「${imported.name}」`, 'ok');
    log('info', `导入项目：${imported.name}（${imported.versions.length} 个版本）`);
    render();
  } catch (err) {
    toast('导入失败：' + String(err && err.message), 'error');
    log('error', '导入异常：' + String(err && err.message));
  }
}

/* --------------------------------------------------------- account sync */
function buildSyncSnapshot() {
  const state = JSON.parse(JSON.stringify(store.getState()));
  const appIds = [...new Set(state.projects.flatMap((p) => collectAppIds(p)))];
  return {
    schemaVersion: 1,
    savedAt: nowIso(),
    state,
    appData: store.storage.collectAppData(appIds),
  };
}

function renderSyncState(message = '') {
  const session = syncClient.session();
  ui.syncAuth.hidden = !!session || !syncAvailable;
  ui.syncSession.hidden = !session;
  ui.syncUser.textContent = session ? session.username : '';
  ui.syncRevision.textContent = session ? String(session.revision || 0) : '0';
  ui.syncStatus.textContent = message || (syncAvailable
    ? session ? '已连接服务端，可以在不同设备登录同一账号同步。' : '服务端同步可用，请登录或注册。'
    : '当前是静态部署：项目仍保存在本机。使用 Node 服务端模式可启用账号同步。');
  ui.syncError.hidden = true;
  for (const button of [ui.btnSyncLogin, ui.btnSyncRegister, ui.btnSyncPush, ui.btnSyncPull, ui.btnSyncLogout]) {
    button.disabled = syncBusy;
  }
}

function syncError(error) {
  ui.syncError.textContent = String(error && error.message || error);
  ui.syncError.hidden = false;
  log('error', `同步失败：${ui.syncError.textContent}`);
}

async function withSyncBusy(action) {
  if (syncBusy) return;
  syncBusy = true;
  renderSyncState('正在处理…');
  try {
    await action();
  } catch (error) {
    syncError(error);
  } finally {
    syncBusy = false;
    const session = syncClient.session();
    ui.syncAuth.hidden = !!session || !syncAvailable;
    ui.syncSession.hidden = !session;
    ui.syncUser.textContent = session ? session.username : '';
    ui.syncRevision.textContent = session ? String(session.revision || 0) : '0';
    for (const button of [ui.btnSyncLogin, ui.btnSyncRegister, ui.btnSyncPush, ui.btnSyncPull, ui.btnSyncLogout]) button.disabled = false;
  }
}

async function checkSyncHealth() {
  const health = await syncClient.health();
  syncAvailable = !!health.ok;
  ui.btnCloud.textContent = syncAvailable ? '账号同步' : '本地数据';
  renderSyncState();
}

function credentials() {
  return { username: ui.syncUsername.value.trim(), password: ui.syncPassword.value };
}

async function authenticate(mode) {
  await withSyncBusy(async () => {
    const { username, password } = credentials();
    if (!username || password.length < 8) throw new Error('请输入有效用户名和至少 8 位密码。');
    if (mode === 'register') await syncClient.register(username, password);
    else await syncClient.login(username, password);
    ui.syncPassword.value = '';
    renderSyncState(mode === 'register' ? '注册成功，已登录。' : '登录成功。');
    toast(mode === 'register' ? '账号创建成功' : '登录成功', 'ok');
  });
}

async function pushCloud() {
  await withSyncBusy(async () => {
    await syncClient.push(buildSyncSnapshot());
    renderSyncState('当前浏览器数据已上传。');
    toast('云端同步完成', 'ok');
    log('info', '云端同步：上传成功');
  });
}

async function pullCloud() {
  await withSyncBusy(async () => {
    const result = await syncClient.pull();
    if (!result.snapshot) throw new Error('云端还没有数据，请先在一台设备上传。');
    const snapshot = result.snapshot;
    if (!snapshot.state || !Array.isArray(snapshot.state.projects)) throw new Error('云端数据格式不正确。');
    try { window.localStorage.setItem(SYNC_BACKUP_KEY, JSON.stringify(buildSyncSnapshot())); } catch { /* best effort */ }
    store.update((state) => {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, JSON.parse(JSON.stringify(snapshot.state)));
    }, { immediate: true });
    for (const [appId, data] of Object.entries(snapshot.appData || {})) store.storage.setAppData(appId, data);
    previewVersionId = null;
    loadedPreviewKey = '';
    render();
    renderSyncState('云端数据已下载；覆盖前的本地快照已自动备份。');
    toast('云端数据已恢复', 'ok');
    log('info', '云端同步：下载并恢复成功');
  });
}

/* ------------------------------------------------------------ tabs/nav */
function switchTab(name) {
  activeTab = name;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.tab === name);
  }
  for (const panel of document.querySelectorAll('.tab-panel')) {
    panel.classList.toggle('active', panel.id === `tab-${name}`);
  }
  if (name === 'console') renderConsole(ui.consoleView, logs);
}

function setMobileView(view) {
  if (window.matchMedia('(max-width: 760px)').matches === false) return;
  ui.columns.dataset.mobileView = view;
  for (const btn of document.querySelectorAll('.mnav')) {
    btn.classList.toggle('active', btn.dataset.view === view);
  }
}

/* ------------------------------------------------------------ bootstrap */
function cacheDom() {
  ui.welcome = $('#welcome');
  ui.workbench = $('#workbench');
  ui.columns = $('#columns');
  ui.projectList = $('#project-list');
  ui.projectTitle = $('#project-title');
  ui.agentState = $('#agent-state');
  ui.chatLog = $('#chat-log');
  ui.suggestions = $('#suggestions');
  ui.composer = $('#composer');
  ui.promptInput = $('#prompt-input');
  ui.btnSend = $('#btn-send');
  ui.composerHint = $('#composer-hint');
  ui.planPanel = $('#plan-panel');
  ui.tracePanel = $('#trace-panel');
  ui.fileTabs = $('#file-tabs');
  ui.codeView = $('#code-view');
  ui.consoleView = $('#console-view');
  ui.versionList = $('#version-list');
  ui.previewFrame = $('#preview-frame');
  ui.previewEmpty = $('#preview-empty');
  ui.previewLabel = $('#preview-label');
  ui.importFile = $('#import-file');
  ui.btnCloud = $('#btn-cloud');
  ui.syncDialog = $('#sync-dialog');
  ui.syncStatus = $('#sync-status');
  ui.syncAuth = $('#sync-auth');
  ui.syncSession = $('#sync-session');
  ui.syncUsername = $('#sync-username');
  ui.syncPassword = $('#sync-password');
  ui.syncUser = $('#sync-user');
  ui.syncRevision = $('#sync-revision');
  ui.syncError = $('#sync-error');
  ui.btnSyncLogin = $('#btn-sync-login');
  ui.btnSyncRegister = $('#btn-sync-register');
  ui.btnSyncPush = $('#btn-sync-push');
  ui.btnSyncPull = $('#btn-sync-pull');
  ui.btnSyncLogout = $('#btn-sync-logout');
}

function bindEvents() {
  ui.btnCloud.addEventListener('click', () => {
    renderSyncState();
    ui.syncDialog.showModal();
  });
  ui.btnSyncLogin.addEventListener('click', () => authenticate('login'));
  ui.btnSyncRegister.addEventListener('click', () => authenticate('register'));
  ui.btnSyncPush.addEventListener('click', pushCloud);
  ui.btnSyncPull.addEventListener('click', pullCloud);
  ui.btnSyncLogout.addEventListener('click', () => {
    syncClient.logout();
    renderSyncState('已退出账号，本机数据不受影响。');
    toast('已退出同步账号', 'info');
  });
  $('#welcome-create').addEventListener('click', () => {
    store.update((s) => { s.welcomeSeen = true; }, { immediate: true });
    const p = newProject('新项目 1');
    enterWorkbench();
    pushMessage('system', '空项目已创建。描述你想要的应用，例如「做一个面试任务管理器，支持优先级、分类筛选和进度统计」。');
    render();
    return p;
  });

  $('#welcome-demo').addEventListener('click', () => {
    store.update((s) => {
      s.welcomeSeen = true;
      const demo = s.projects.find((x) => x.name === '面试准备计划器');
      if (demo) s.activeProjectId = demo.id;
    }, { immediate: true });
    enterWorkbench();
    render();
  });

  $('#btn-new-project').addEventListener('click', () => newProject());
  $('#btn-export').addEventListener('click', exportProject);
  $('#btn-import').addEventListener('click', () => ui.importFile.click());
  ui.importFile.addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    importProjectFile(file);
    ev.target.value = '';
  });

  ui.composer.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = ui.promptInput.value;
    ui.promptInput.value = '';
    submitPrompt(text);
  });
  ui.promptInput.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
      ev.preventDefault();
      ui.composer.requestSubmit();
    }
  });

  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  }
  for (const btn of document.querySelectorAll('.mnav')) {
    btn.addEventListener('click', () => {
      ui.columns.dataset.mobileView = btn.dataset.view;
      for (const other of document.querySelectorAll('.mnav')) other.classList.toggle('active', other === btn);
    });
  }

  $('#btn-copy-code').addEventListener('click', async () => {
    const view = viewedProject();
    if (!view || !view.files) return toast('还没有代码可复制', 'warn');
    const ok = await copyText(view.files[activeFile]);
    toast(ok ? `${activeFile} 已复制` : '复制失败，请手动选择文本', ok ? 'ok' : 'error');
  });

  $('#btn-download-file').addEventListener('click', () => {
    const view = viewedProject();
    if (!view || !view.files) return toast('还没有代码可下载', 'warn');
    downloadText(activeFile, view.files[activeFile]);
    toast(`${activeFile} 已下载`, 'ok');
  });

  $('#btn-download-all').addEventListener('click', () => {
    const view = viewedProject();
    if (!view || !view.files) return toast('还没有代码可下载', 'warn');
    for (const [name, content] of Object.entries(view.files)) downloadText(name, content);
    toast('三个文件已下载', 'ok');
  });

  $('#btn-clear-console').addEventListener('click', () => {
    logs.length = 0;
    renderConsole(ui.consoleView, logs);
  });

  $('#btn-reload-preview').addEventListener('click', () => {
    bridge.reload();
    toast('预览已重新加载', 'info');
  });

  $('#btn-open-blank').addEventListener('click', () => {
    const view = viewedProject();
    if (!view || !view.files) return toast('还没有可打开的应用', 'warn');
    const win = window.open('', '_blank');
    if (!win) return toast('浏览器拦截了新窗口', 'error');
    win.document.open();
    win.document.write(view.files['index.html']
      .replace('<link rel="stylesheet" href="./styles.css" />', `<style>\n${view.files['styles.css']}\n</style>`)
      .replace('<script type="module" src="./app.js"></script>', `<script>\n${view.files['app.js']}\n</script>`));
    win.document.close();
  });

  window.addEventListener('error', (ev) => log('error', `Builder 异常：${ev.message}`));
  window.addEventListener('unhandledrejection', (ev) => log('error', `未处理的 Promise：${String(ev.reason)}`));
}

function enterWorkbench() {
  ui.welcome.hidden = true;
  ui.workbench.hidden = false;
}

function seedIfEmpty() {
  const state = store.getState();
  if (state.projects.length) return;
  const demo = buildSeedProject();
  if (!demo) {
    log('error', '预置项目构建失败');
    return;
  }
  store.update((s) => {
    s.projects.push(demo);
    s.activeProjectId = demo.id;
  }, { immediate: true });
  log('info', '已载入预置演示项目：面试准备计划器');
}

function init() {
  cacheDom();
  initToast($('#toast-host'));
  bridge = createPreviewBridge({
    frame: ui.previewFrame,
    emptyNode: ui.previewEmpty,
    storage: store.storage,
    onLog: log,
  });
  bindEvents();
  checkSyncHealth();
  seedIfEmpty();

  if (!store.persistent) {
    log('warn', 'localStorage 不可用（隐私模式？），本次会话数据不会持久化。');
    toast('localStorage 不可用，数据不会持久化', 'warn', 4000);
  }

  const state = store.getState();
  if (state.welcomeSeen) enterWorkbench();
  else ui.welcome.hidden = false;

  render();
  log('info', 'ForgeFlow 就绪 · 本地 Agent，无需 API Key');
}

init();
