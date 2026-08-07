import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTrayController, createTrayMenuTemplate, configureTray, type TrayLike } from './tray';
import { createDatabase } from './db/database';
import { SessionRepository } from './db/repositories';
import { ExportService } from './services/export-service';
import { SessionService } from './services/session-service';
import { SettingsService } from './services/settings-service';
import { registerIpc, type IpcRegistration } from './ipc/register-ipc';
import { createWindowFocusController } from './window-policy';
import {
  acquireSingleInstance,
  configureWindow,
  createWindowManager,
  type BrowserWindowLike,
  type WindowManager,
} from './windows/main-window';
function createElectronWindowManager(
  windowFocusController: ReturnType<typeof createWindowFocusController>,
  repository: SessionRepository,
): WindowManager {
  const rendererFile = join(__dirname, '../renderer/index.html');
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  return createWindowManager({
    createMainWindow: (options) => new BrowserWindow(options) as unknown as BrowserWindowLike,
    createMiniWindow: (options) => new BrowserWindow(options) as unknown as BrowserWindowLike,
    getSettings: () => repository.getSettings(),
    saveSettings: (settings) => repository.saveSettings(settings),
    getScreenWorkAreas: () => screen.getAllDisplays().map((display) => display.workArea),
    configureSecurity: configureWindow,
    loadRenderer: (window) => {
      if (rendererUrl) {
        void window.loadURL(rendererUrl);
      } else {
        void window.loadFile(rendererFile);
      }
    },
    rendererUrl: rendererUrl ?? pathToFileURL(rendererFile).href,
    rendererFile,
    preloadPath: join(__dirname, '../preload/index.js'),
    onMainWindowCreated: (window) => windowFocusController.setWindow(window),
    onMainWindowClosed: () => windowFocusController.setWindow(null),
  });
}

function createApplication(windowManager: WindowManager): () => void {
  let tray: TrayLike | null = null;
  const destroyTray = (): void => {
    tray?.destroy();
    tray = null;
  };
  const quitController = createTrayController({
    tray: {
      destroy: destroyTray,
      setContextMenu: () => undefined,
      setToolTip: () => undefined,
      on: () => undefined,
    },
    setQuitting: (value) => windowManager.setQuitting(value),
    quitApp: () => app.quit(),
  });
  const menuTemplate = createTrayMenuTemplate({
    showMain: () => windowManager.showMainWindow(),
    showMini: () => windowManager.showMiniWindow(),
    quit: () => quitController.quit(),
  });

  tray = new Tray(nativeImage.createEmpty());
  configureTray(tray, Menu.buildFromTemplate(menuTemplate), {
    showMain: () => windowManager.showMainWindow(),
    showMini: () => windowManager.showMiniWindow(),
    quit: () => quitController.quit(),
  });
  windowManager.createMainWindow();
  return destroyTray;
}

if (process.env.ELECTRON_USER_DATA_DIR) {
  app.setPath('userData', process.env.ELECTRON_USER_DATA_DIR);
}

let windowManager: WindowManager | null = null;
const windowFocusController = createWindowFocusController();

if (acquireSingleInstance(app, () => {
  if (windowManager) {
    windowManager.focusExistingWindow();
  } else {
    windowFocusController.requestFocus();
  }
})) {
  app.whenReady().then(() => {
    const database = createDatabase(join(app.getPath('userData'), 'pw-tool.sqlite3'));
    const repository = new SessionRepository(database);
    windowManager = createElectronWindowManager(windowFocusController, repository);
    const session = new SessionService(repository);
    const settings = new SettingsService(repository);
    const exportService = new ExportService(
      repository,
      async () => {
        const result = await dialog.showSaveDialog({ defaultPath: '陪玩小工具.csv' });
        return result.canceled ? null : result.filePath;
      },
      (filePath, contents) => writeFile(filePath, contents, 'utf8'),
    );
    const registration: IpcRegistration = registerIpc({
      ipcMain,
      session,
      history: { list: (input) => repository.list(input), delete: (id) => repository.delete(id), exportCsv: (input) => exportService.exportCsv(input) },
      settings,
      window: {
        showMain: () => windowManager?.showMainWindow(),
        showMini: () => windowManager?.showMiniWindow(),
        setAlwaysOnTop: (value) => windowManager?.setMiniAlwaysOnTop(value) ?? false,
      },
      snapshotTargets: () => windowManager?.getSnapshotTargets() ?? [],
    });
    const destroyTray = createApplication(windowManager);
    app.once('before-quit', () => {
      registration.unregister();
      destroyTray();
      database.close();
    });
    app.on('activate', () => windowManager?.showMainWindow());
  });
}
