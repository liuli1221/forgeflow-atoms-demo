import { test, expect } from '@playwright/test';

test('自定义 Schema → 生成 → CRUD → 刷新 → 账号跨浏览器同步', async ({ page, browser }) => {
  const username = `e2e_${Date.now()}`;
  const password = 'E2e-pass-1234';

  await page.goto('/');
  await page.getByRole('button', { name: '创建第一个项目' }).click();
  await page.getByPlaceholder(/例如：做一个面试任务管理器/).fill(
    '做一个宠物档案，字段包括宠物名、品种(猫/狗/其他)、出生日期、是否绝育、体重，支持搜索和统计',
  );
  await page.getByRole('button', { name: '发送给 Agent' }).click();

  await expect(page.getByText('自定义 Schema（custom）')).toBeVisible();
  await expect(page.getByText('宠物名', { exact: true })).toBeVisible();
  await expect(page.getByText('品种', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '批准并执行' }).click();
  await expect(page.getByText(/v1 已保存/)).toBeVisible({ timeout: 10_000 });

  const preview = page.frameLocator('#preview-frame');
  await preview.getByRole('button', { name: '+ 新增宠物' }).click();
  const form = preview.getByRole('dialog', { name: '新增宠物' });
  await form.getByLabel('宠物名').fill('团子');
  await form.getByLabel('品种').selectOption('猫');
  await form.getByLabel('出生日期').fill('2023-05-20');
  await form.getByLabel('是否绝育').check();
  await form.getByLabel('体重').fill('4.6');
  await form.getByRole('button', { name: '保存' }).click();
  await expect(preview.getByText('团子', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator('#workbench')).toBeVisible();
  await expect(page.frameLocator('#preview-frame').getByText('团子', { exact: true })).toBeVisible();

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
  await expect(other.locator('#project-title')).toContainText('宠物档案');
  await expect(other.frameLocator('#preview-frame').getByText('团子', { exact: true })).toBeVisible();
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
