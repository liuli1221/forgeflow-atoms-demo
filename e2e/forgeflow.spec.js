import { test, expect } from '@playwright/test';
import { makeArtifactFixture } from '../test/fixtures/llm-artifacts.mjs';

test('普通任务需求 → AI 生成 API → CRUD → 刷新 → 账号跨浏览器同步', async ({ page, browser }) => {
  const username = `e2e_${Date.now()}`;
  const password = 'E2e-pass-1234';
  let generationRequest = null;

  await page.route('**/api/generate', async (route) => {
    generationRequest = route.request().postDataJSON();
    const artifact = makeArtifactFixture('crud', { appId: generationRequest.appId });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        artifact,
        spec: {
          specVersion: 1,
          appId: generationRequest.appId,
          appName: '面试任务管理器',
          tagline: '由 AI Agent 测试替身生成',
          domain: 'custom',
          entityName: '任务',
          theme: { mode: 'light', accent: '#4f6bed' },
          layout: { view: 'cards', showSearch: true, showStats: false, showFilters: false },
          fields: [{ key: 'title', label: '任务标题', type: 'text', required: true, primary: true }],
          filters: [],
          metrics: [],
          seedItems: [],
          sourcePrompt: generationRequest.prompt,
          engine: 'ai-agent',
          appType: 'crud',
          acceptanceCriteria: ['可以新增并持久化任务'],
        },
        files: artifact.files,
        checks: [{ id: 'fixture', label: 'E2E fixture', status: 'pass', detail: '' }],
        attempts: [{ attempt: 1, ok: true, errors: [] }],
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '创建第一个项目' }).click();
  await page.getByPlaceholder(/例如：做一个面试任务管理器/).fill(
    '做一个面试任务管理器，支持优先级、分类筛选和进度统计',
  );
  await page.getByRole('button', { name: '发送给 Agent' }).click();

  await expect(page.locator('#plan-panel').getByText('AI Agent', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/DeepSeek/i);
  await page.getByRole('button', { name: '批准并执行' }).click();
  await expect(page.getByText(/v1 已保存/)).toBeVisible({ timeout: 10_000 });
  expect(generationRequest.prompt).toContain('任务管理器');
  expect(generationRequest.mode).toBe('create');

  const preview = page.frameLocator('#preview-frame');
  await preview.getByTestId('item-add').click();
  await preview.getByTestId('item-title').fill('准备 Agent 面试');
  await preview.getByTestId('item-save').click();
  await expect(preview.getByText('准备 Agent 面试', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('#workbench')).toBeVisible();
  await expect(page.frameLocator('#preview-frame').getByText('准备 Agent 面试', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /账号同步|本地数据|云同步/ }).click();
  await expect(page.getByText('服务端同步可用，请登录或注册。')).toBeVisible();
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page.getByText('注册成功，已登录。')).toBeVisible();
  await page.getByRole('button', { name: '上传当前数据' }).click();
  await expect(page.getByText('当前浏览器数据已上传。')).toBeVisible();

  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto('/');
  await other.getByRole('button', { name: '直接看预置演示' }).click();
  await other.getByRole('button', { name: /账号同步|本地数据|云同步/ }).click();
  await other.getByLabel('用户名').fill(username);
  await other.getByLabel('密码').fill(password);
  await other.getByRole('button', { name: '登录', exact: true }).click();
  await expect(other.getByText('登录成功。')).toBeVisible();
  await other.getByRole('button', { name: '下载云端数据' }).click();
  await expect(other.getByText('云端数据已下载；覆盖前的本地快照已自动备份。')).toBeVisible();
  await expect(other.locator('#project-title')).toContainText('面试任务管理器');
  await expect(other.frameLocator('#preview-frame').getByText('准备 Agent 面试', { exact: true })).toBeVisible();
  await second.close();
});

test('静态页面无脚本错误且关键操作可见', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/ForgeFlow/);
  await expect(page.getByRole('button', { name: '创建第一个项目' })).toBeVisible();
  await expect(page.getByRole('button', { name: '直接看预置演示' })).toBeVisible();
  expect(errors).toEqual([]);
});
