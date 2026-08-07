import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

export interface ElectronAppFixture {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  showMainWindow(): Promise<void>;
}

export async function launchElectronApp(): Promise<ElectronAppFixture> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'pw-tool-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, ELECTRON_USER_DATA_DIR: userDataDir },
  });
  const page = await app.firstWindow();

  const showMainWindow = async (): Promise<void> => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show());
  };

  const close = app.close.bind(app);
  app.close = async (): Promise<void> => {
    try {
      await app.evaluate(({ app }) => app.exit(0));
    } catch {
      await close().catch(() => undefined);
    }
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => undefined);
  };

  return { app, page, userDataDir, showMainWindow };
}
