/**
 * Host side of the preview bridge.
 *
 * The preview iframe is sandboxed WITHOUT allow-same-origin, so it has an
 * opaque origin and cannot use localStorage itself. Business data therefore
 * travels over postMessage and is persisted by the host under
 * `forgeflow.appdata.<appId>` — which is exactly what makes preview data
 * survive a page refresh.
 */
import { buildPreviewDocument } from '../core/generator/index.js';
import { APP_DATA_PREFIX } from '../core/storage.js';

export function createPreviewBridge({ frame, emptyNode, storage, onLog, onSaved }) {
  let currentAppId = null;
  let lastFiles = null;

  function post(message) {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage(message, '*');
  }

  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (!msg || msg.source !== 'forgeflow-app') return;
    if (frame.contentWindow && ev.source !== frame.contentWindow) return;

    if (msg.type === 'ready') {
      if (!currentAppId || msg.appId !== currentAppId) {
        onLog && onLog('warn', `[preview] 拒绝非法应用 id: ${String(msg.appId)}`);
        return;
      }
      const data = storage.getAppData(currentAppId);
      post({ source: 'forgeflow-host', type: 'init', data });
      onLog && onLog('info', `[preview] app ready (${currentAppId})，已注入 ${data && data.items ? data.items.length : 0} 条历史数据`);
      return;
    }

    if (msg.type === 'save') {
      const expectedKey = currentAppId ? APP_DATA_PREFIX + currentAppId : '';
      if (typeof msg.key !== 'string' || !expectedKey || msg.key !== expectedKey) {
        onLog && onLog('warn', `[preview] 拒绝非法存储 key: ${String(msg.key)}`);
        return;
      }
      const res = storage.setAppDataRaw(msg.key, msg.data);
      if (!res.ok) onLog && onLog('error', `[preview] 数据保存失败：${res.error}`);
      else {
        onLog && onLog('info', `[preview] 数据已持久化（${(msg.data && msg.data.items ? msg.data.items.length : 0)} 条）`);
        onSaved && onSaved(msg.data);
      }
      return;
    }

    if (msg.type === 'log') {
      onLog && onLog(msg.level || 'info', `[app] ${msg.message}`);
    }
  });

  return {
    load(files, spec) {
      lastFiles = files;
      currentAppId = spec ? spec.appId : null;
      frame.srcdoc = buildPreviewDocument(files);
      if (emptyNode) emptyNode.hidden = true;
    },
    reload() {
      if (lastFiles) frame.srcdoc = buildPreviewDocument(lastFiles);
    },
    clear() {
      lastFiles = null;
      currentAppId = null;
      frame.removeAttribute('srcdoc');
      frame.srcdoc = '';
      if (emptyNode) emptyNode.hidden = false;
    },
    currentAppId: () => currentAppId,
    currentFiles: () => lastFiles,
  };
}
