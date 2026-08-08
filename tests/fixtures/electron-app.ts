import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

export interface ElectronAppFixture {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  showMainWindow(): Promise<void>;
  close(): Promise<void>;
}

export interface LaunchElectronAppOptions {
  userDataDir?: string;
  retainUserDataDir?: boolean;
}

export async function launchElectronApp(options: LaunchElectronAppOptions = {}): Promise<ElectronAppFixture> {
  const userDataDir = options.userDataDir ?? await mkdtemp(join(tmpdir(), 'pw-tool-e2e-'));
  const createdUserDataDir = options.userDataDir === undefined;
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, ELECTRON_USER_DATA_DIR: userDataDir },
  });
  const page = await app.firstWindow();

  const showMainWindow = async (): Promise<void> => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show());
  };

  const close = app.close.bind(app);
  const dispose = async (): Promise<void> => {
    try {
      await app.evaluate(({ app }) => app.exit(0));
    } catch {
      await close().catch(() => undefined);
    }
    if (createdUserDataDir && !options.retainUserDataDir) {
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => undefined);
    }
  };

  app.close = dispose;

  return { app, page, userDataDir, showMainWindow, close: dispose };
}
