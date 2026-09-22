function positiveInt(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function utcDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function createGenerationGuard(options = {}) {
  const now = options.now || Date.now;
  const perClientMax = positiveInt(options.perClientMax, 5, 1, 1000);
  const windowMs = positiveInt(options.windowMs, 60 * 60 * 1000, 1000);
  const dailyMax = positiveInt(options.dailyMax, 30, 1, 100_000);
  const maxConcurrent = positiveInt(options.maxConcurrent, 2, 1, 100);
  const clients = new Map();
  let day = utcDay(now());
  let dailyUsed = 0;
  let active = 0;

  function refresh(timestamp) {
    const currentDay = utcDay(timestamp);
    if (currentDay !== day) {
      day = currentDay;
      dailyUsed = 0;
    }
    for (const [key, bucket] of clients) {
      if (bucket.resetAt <= timestamp) clients.delete(key);
    }
  }

  function reject(status, code, error, retryAfterSeconds = 0) {
    return { ok: false, status, code, error, retryAfterSeconds };
  }

  function begin(clientId) {
    const timestamp = now();
    refresh(timestamp);
    const key = String(clientId || 'anonymous');
    const bucket = clients.get(key) || { count: 0, resetAt: timestamp + windowMs };

    if (dailyUsed >= dailyMax) {
      const tomorrow = Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000;
      return reject(429, 'DAILY_LIMIT', '今日 AI 体验额度已用完，请明天再试。', Math.max(1, Math.ceil((tomorrow - timestamp) / 1000)));
    }
    if (bucket.count >= perClientMax) {
      return reject(429, 'CLIENT_LIMIT', '你的 AI 生成次数已达到本时段上限，请稍后再试。', Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000)));
    }
    if (active >= maxConcurrent) {
      return reject(503, 'CONCURRENCY_LIMIT', '当前生成任务较多，请稍后重试。', 15);
    }

    bucket.count += 1;
    clients.set(key, bucket);
    dailyUsed += 1;
    active += 1;
    let released = false;
    return {
      ok: true,
      remaining: Math.max(0, perClientMax - bucket.count),
      dailyRemaining: Math.max(0, dailyMax - dailyUsed),
      resetAt: bucket.resetAt,
      release() {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
      },
    };
  }

  function policy() {
    return { perClientMax, windowMs, dailyMax, maxConcurrent };
  }

  function snapshot() {
    refresh(now());
    return { ...policy(), dailyUsed, active };
  }

  return { begin, policy, snapshot };
}

export function generationGuardFromEnv(env = process.env, options = {}) {
  return createGenerationGuard({
    ...options,
    perClientMax: env.FORGEFLOW_GENERATE_PER_HOUR,
    windowMs: 60 * 60 * 1000,
    dailyMax: env.FORGEFLOW_GENERATE_DAILY,
    maxConcurrent: env.FORGEFLOW_GENERATE_CONCURRENCY,
  });
}
