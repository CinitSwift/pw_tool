import { expect, test } from '@playwright/test';
import { launchElectronApp } from '../fixtures/electron-app';
import { createTestDatabase } from '../fixtures/test-database';

test('shows recovery choices after restarting with an unfinished session', async () => {
  const database = await createTestDatabase();
  await database.seedRunningSession();

  const firstLaunch = await launchElectronApp({ userDataDir: database.userDataDir, retainUserDataDir: true });
  try {
  } finally {
    await firstLaunch.close();
  }

  const restarted = await launchElectronApp({ userDataDir: database.userDataDir, retainUserDataDir: true });
  try {
    await expect(restarted.page.getByText('发现未完成记录')).toBeVisible();
    await expect(restarted.page.getByRole('heading', { name: '上次计时尚未结束' })).toBeVisible();
    await expect(restarted.page.getByRole('button', { name: '恢复计时' })).toBeVisible();
  } finally {
    await restarted.close();
    await database.close();
  }
});
