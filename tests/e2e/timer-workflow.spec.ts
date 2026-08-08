import { expect, test } from '@playwright/test';
import { launchElectronApp } from '../fixtures/electron-app';
import { createTestDatabase } from '../fixtures/test-database';

test('starts, pauses, resumes, completes, and shows the completed session in history', async () => {
  const database = await createTestDatabase();
  const { page, close } = await launchElectronApp({ userDataDir: database.userDataDir, retainUserDataDir: true });

  try {
    await expect(page.getByRole('button', { name: '开始计时' })).toBeVisible();

    await page.getByRole('button', { name: '开始计时' }).click();
    await expect(page.getByRole('button', { name: '暂停计时' })).toBeVisible();

    await page.getByRole('button', { name: '暂停计时' }).click();
    await expect(page.getByRole('button', { name: '继续计时' })).toBeVisible();

    await page.getByRole('button', { name: '继续计时' }).click();
    await expect(page.getByRole('button', { name: '结束本局' })).toBeVisible();

    await page.getByRole('button', { name: '结束本局' }).click();
    await expect(page.getByRole('heading', { name: '本局已完成' })).toBeVisible();

    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '历史', exact: true }).click();
    await expect(page.getByRole('heading', { name: '历史记录' })).toBeVisible();
    const record = page.locator('[data-record-id]').first();
    await expect(record).toBeVisible();
    await expect(record.getByText('有效', { exact: true })).toBeVisible();
    await expect(record.getByRole('button', { name: '调整时间' })).toBeVisible();
    await expect(record.getByText('有效时长', { exact: true })).toBeVisible();
    await expect(record.getByText('应得金额', { exact: true })).toBeVisible();
  } finally {
    await close();
    await database.close();
  }
});
