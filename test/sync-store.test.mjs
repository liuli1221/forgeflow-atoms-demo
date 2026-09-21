import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSyncStore } from '../server/sync-store.mjs';

test('账号注册、登录、持久化和 revision 冲突检测', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'forgeflow-sync-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'sync.json');
  const store = createSyncStore({ filePath, secret: 'test-secret' });

  const registered = await store.register('candidate', 'password-123');
  assert.equal(registered.ok, true);
  assert.ok(registered.token);
  assert.equal((await store.register('candidate', 'password-123')).status, 409);
  assert.equal((await store.login('candidate', 'wrong-password')).status, 401);

  const loggedIn = await store.login('candidate', 'password-123');
  const snapshot = { state: { projects: [{ id: 'p1', name: '跨设备项目' }] }, appData: { app_1: { items: [] } } };
  const saved = await store.write(loggedIn.token, 0, snapshot);
  assert.equal(saved.revision, 1);

  const conflict = await store.write(loggedIn.token, 0, snapshot);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.revision, 1);

  const loaded = await store.read(loggedIn.token);
  assert.deepEqual(loaded.snapshot, snapshot);
  assert.equal(loaded.revision, 1);

  const disk = JSON.parse(await readFile(filePath, 'utf8'));
  assert.notEqual(disk.users.candidate.passwordHash, 'password-123');
  assert.ok(disk.users.candidate.salt);
});
