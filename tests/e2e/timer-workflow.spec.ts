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

test('edits a running session by changing only the start time and persists the save', async () => {
  const database = await createTestDatabase();
  await database.seedRunningSession();
  const { page, close } = await launchElectronApp({ userDataDir: database.userDataDir, retainUserDataDir: true });

  try {
    await expect(page.getByRole('button', { name: '调整时间' })).toBeVisible();
    await page.getByRole('button', { name: '调整时间' }).click();

    const dialog = page.getByRole('dialog', { name: '调整时间' });
    const saveButton = dialog.getByRole('button', { name: '保存修改' });
    const startInput = dialog.getByLabel('第 1 段开始时间');
    const endInput = dialog.getByLabel('第 1 段结束时间');

    await expect(endInput).toHaveValue('');
    await startInput.fill('2026-08-06T09:05');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(dialog).not.toBeVisible();

    const active = database.repository.findActive();
    expect(active).not.toBeNull();
    expect(active?.id).toBe('running-session');
    expect(active?.segments).toEqual([
      {
        sequence: 0,
        startedAt: new Date('2026-08-06T09:05').getTime(),
        endedAt: null,
      },
    ]);
  } finally {
    await close();
    await database.close();
  }
});
