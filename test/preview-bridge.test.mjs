import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewBridge } from '../src/ui/preview-bridge.js';
import { makeArtifactFixture } from './fixtures/llm-artifacts.mjs';

test('preview bridge 只允许当前 appId 读取和写入业务数据', () => {
  const originalWindow = globalThis.window;
  let onMessage = null;
  const posted = [];
  const reads = [];
  const writes = [];
  const contentWindow = { postMessage: (message) => posted.push(message) };
  globalThis.window = {
    addEventListener(type, handler) {
      if (type === 'message') onMessage = handler;
    },
  };

  try {
    const bridge = createPreviewBridge({
      frame: { contentWindow, srcdoc: '', removeAttribute() {} },
      emptyNode: { hidden: false },
      storage: {
        getAppData(appId) {
          reads.push(appId);
          return { items: [{ title: '已保存任务' }] };
        },
        setAppDataRaw(key, data) {
          writes.push({ key, data });
          return { ok: true };
        },
      },
    });
    const files = makeArtifactFixture('crud', { appId: 'app_current' }).files;
    bridge.load(files, { appId: 'app_current' });

    onMessage({ source: contentWindow, data: { source: 'forgeflow-app', type: 'ready', appId: 'app_other' } });
    assert.deepEqual(reads, []);
    assert.deepEqual(posted, []);

    onMessage({ source: contentWindow, data: { source: 'forgeflow-app', type: 'ready', appId: 'app_current' } });
    assert.deepEqual(reads, ['app_current']);
    assert.equal(posted[0].type, 'init');

    onMessage({ source: contentWindow, data: { source: 'forgeflow-app', type: 'save', key: 'forgeflow.appdata.app_other', data: { items: [] } } });
    assert.deepEqual(writes, []);

    const data = { items: [{ title: '新任务' }] };
    onMessage({ source: contentWindow, data: { source: 'forgeflow-app', type: 'save', key: 'forgeflow.appdata.app_current', data } });
    assert.deepEqual(writes, [{ key: 'forgeflow.appdata.app_current', data }]);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
