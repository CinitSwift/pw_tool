import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('launches the desktop shell', async () => {
  const app = await electron.launch({ args: ['.'] });

  try {
    const page = await app.firstWindow();

    await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
    await expect(page).toHaveTitle('陪玩小工具');
  } finally {
    await app.close();
  }
});
