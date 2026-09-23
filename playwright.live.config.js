import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-live',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'PORT=4174 node server.mjs',
    url: 'http://127.0.0.1:4174/api/health',
    reuseExistingServer: false,
    timeout: 15_000,
    env: {
      FORGEFLOW_DATA_FILE: '.data/e2e-llm-sync.json',
      FORGEFLOW_SESSION_SECRET: 'forgeflow-e2e-llm-secret',
      DEEPSEEK_TIMEOUT_MS: '60000',
    },
  },
});
