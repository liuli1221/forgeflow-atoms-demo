import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationGuard, generationGuardFromEnv } from '../server/generation-guard.mjs';

test('每个客户端在时间窗口内受次数限制，窗口后恢复', () => {
  let time = Date.parse('2026-09-22T00:00:00Z');
  const guard = createGenerationGuard({ now: () => time, perClientMax: 2, dailyMax: 10, maxConcurrent: 2, windowMs: 1000 });
  const first = guard.begin('alice');
  first.release();
  const second = guard.begin('alice');
  second.release();
  const blocked = guard.begin('alice');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'CLIENT_LIMIT');
  assert.equal(blocked.status, 429);
  time += 1001;
  const restored = guard.begin('alice');
  assert.equal(restored.ok, true);
  restored.release();
});

test('并发令牌释放幂等，释放后可继续生成', () => {
  const guard = createGenerationGuard({ perClientMax: 10, dailyMax: 10, maxConcurrent: 1 });
  const active = guard.begin('alice');
  const blocked = guard.begin('bob');
  assert.equal(blocked.code, 'CONCURRENCY_LIMIT');
  active.release();
  active.release();
  const next = guard.begin('bob');
  assert.equal(next.ok, true);
  next.release();
  assert.equal(guard.snapshot().active, 0);
});

test('全站每日预算跨客户端生效并在 UTC 次日重置', () => {
  let time = Date.parse('2026-09-22T23:59:59Z');
  const guard = createGenerationGuard({ now: () => time, perClientMax: 10, dailyMax: 2, maxConcurrent: 2 });
  guard.begin('alice').release();
  guard.begin('bob').release();
  assert.equal(guard.begin('carol').code, 'DAILY_LIMIT');
  time += 2000;
  const restored = guard.begin('carol');
  assert.equal(restored.ok, true);
  restored.release();
});

test('环境变量配置被解析并限制在安全范围', () => {
  const guard = generationGuardFromEnv({
    FORGEFLOW_GENERATE_PER_HOUR: '8',
    FORGEFLOW_GENERATE_DAILY: '40',
    FORGEFLOW_GENERATE_CONCURRENCY: '3',
  });
  assert.deepEqual(guard.policy(), {
    perClientMax: 8,
    windowMs: 3_600_000,
    dailyMax: 40,
    maxConcurrent: 3,
  });
});
