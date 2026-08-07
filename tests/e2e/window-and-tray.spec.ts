import { expect, test } from '@playwright/test';
import { launchElectronApp } from '../fixtures/electron-app';

test('hides the main window and restores it through the fixture', async () => {
  const { app, page, showMainWindow } = await launchElectronApp();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(false);
  await showMainWindow();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true);
  expect(await page.title()).toBe('陪玩小工具');
  await app.close();
});

test('switches from the main window to the mini window through IPC', async () => {
  const { app, page } = await launchElectronApp();

  await page.evaluate(() => window.pwTool.window.showMini());
  const windows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => ({
    bounds: window.getBounds(),
    visible: window.isVisible(),
  })));

  expect(windows).toHaveLength(2);
  expect(windows).toEqual(expect.arrayContaining([
    expect.objectContaining({ bounds: expect.objectContaining({ width: 720, height: 620 }), visible: false }),
    expect.objectContaining({ bounds: expect.objectContaining({ width: 280, height: 160 }), visible: true }),
  ]));
  await app.close();
});

test('opens a main window with the Task 7 dimensions', async () => {
  const { app, page } = await launchElectronApp();
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBounds());
  expect(bounds).toMatchObject({ width: 720, height: 620 });
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true);
  expect(await page.title()).toBe('陪玩小工具');
  await app.close();
});
