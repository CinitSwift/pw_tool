import { expect, test } from '@playwright/test';
import { launchElectronApp } from '../fixtures/electron-app';
import { createTestDatabase } from '../fixtures/test-database';

test('opens history and shows completed records and history UI', async () => {
  const database = await createTestDatabase();
  await database.seedCompletedSession();
  const { close, page } = await launchElectronApp({ userDataDir: database.userDataDir, retainUserDataDir: true });

  try {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '历史', exact: true }).click();
    await expect(page.getByRole('heading', { name: '历史记录' })).toBeVisible();
    const record = page.locator('[data-record-id]').filter({ hasText: 'completed-session' });
    await expect(record.getByText('completed-session', { exact: true })).toBeVisible();
    await expect(record.getByText('有效', { exact: true })).toBeVisible();
    await expect(record.getByRole('button', { name: '调整时间' })).toBeVisible();
    await expect(page.getByRole('button', { name: '导出 CSV' })).toBeVisible();
  } finally {
    await close();
    await database.close();
  }
});
