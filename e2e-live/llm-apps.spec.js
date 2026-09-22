import { test, expect } from '@playwright/test';

async function createProject(page, prompt) {
  await page.goto('/');
  await page.getByRole('button', { name: '创建第一个项目' }).click();
  await page.getByPlaceholder(/例如：做一个面试任务管理器/).fill(prompt);
  await page.getByRole('button', { name: '发送给 Agent' }).click();
  await expect(page.getByText('DeepSeek LLM', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '批准并执行' }).click();
  const outcome = page.getByText(/v1 已保存/).or(page.getByText(/执行失败：/)).first();
  await expect(outcome).toBeVisible({ timeout: 210_000 });
  const text = await outcome.textContent();
  expect(text, `真实 LLM 生成失败：${text || '未知错误'}`).toMatch(/v1 已保存/);
  return page.frameLocator('#preview-frame');
}

test('真实 DeepSeek 生成计算器并完成 7 + 5 = 12', async ({ page }) => {
  const preview = await createProject(page, '生成一个现代风格计算器，支持加减乘除、清空和连续计算');
  await expect(preview.getByTestId('app-root')).toBeVisible();
  await preview.getByTestId('key-7').click();
  await preview.getByTestId('key-add').click();
  await preview.getByTestId('key-5').click();
  await preview.getByTestId('key-equals').click();
  await expect(preview.getByTestId('calculator-display')).toHaveText(/12/);
});

test('真实 DeepSeek 生成贪吃蛇并可启动和响应方向键', async ({ page }) => {
  const preview = await createProject(page, '生成一个贪吃蛇游戏，支持方向键控制、计分、碰撞结束和重新开始');
  await expect(preview.getByTestId('snake-canvas')).toBeVisible();
  await expect(preview.getByTestId('snake-score')).toBeVisible();
  await preview.getByTestId('snake-start').click();
  await expect(preview.getByTestId('snake-status')).toHaveText(/running/i);
  await page.keyboard.press('ArrowRight');
  await expect(preview.getByTestId('snake-canvas')).toBeVisible();
});
