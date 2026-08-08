import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTrayController, createTrayMenuTemplate, configureTray, type TrayLike } from './tray';
import { createDatabase } from './db/database';
import { SessionRepository } from './db/repositories';
import { ExportService } from './services/export-service';
import { HistoryService } from './services/history-service';
import { SessionService } from './services/session-service';
import { SettingsService } from './services/settings-service';
import { registerIpc, type IpcRegistration } from './ipc/register-ipc';
import { registerAppBeforeQuitCleanup } from './app-lifecycle';
import { createWindowFocusController } from './window-policy';
import {
  acquireSingleInstance,
  configureWindow,
  createWindowManager,
  type BrowserWindowLike,
  type WindowManager,
} from './windows/main-window';

function withWindowMode(url: string, mode: 'main' | 'mini'): string {
  const parsed = new URL(url);
  parsed.searchParams.set('window', mode);
  return parsed.toString();
}

function withStartupError(url: string, reason: 'database'): string {
  const parsed = new URL(url);
  parsed.searchParams.set('startupError', reason);
  return parsed.toString();
}

function createStartupErrorWindow(rendererTargetUrl: string): BrowserWindowLike {
  const window = new BrowserWindow({
    width: 720,
    height: 620,
    minWidth: 680,
    minHeight: 560,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  }) as unknown as BrowserWindowLike;
  const targetUrl = withStartupError(withWindowMode(rendererTargetUrl, 'main'), 'database');
  configureWindow(window, targetUrl);
  void window.loadURL(targetUrl);
  return window;
}

function createElectronWindowManager(
  windowFocusController: ReturnType<typeof createWindowFocusController>,
  repository: SessionRepository,
): WindowManager {
  const rendererFile = join(__dirname, '../renderer/index.html');
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const rendererTargetUrl = rendererUrl ?? pathToFileURL(rendererFile).href;
  return createWindowManager({
    createMainWindow: (options) => new BrowserWindow(options) as unknown as BrowserWindowLike,
    createMiniWindow: (options) => new BrowserWindow(options) as unknown as BrowserWindowLike,
    getSettings: () => repository.getSettings(),
    saveSettings: (settings) => repository.saveSettings(settings),
    getScreenWorkAreas: () => screen.getAllDisplays().map((display) => display.workArea),
    configureSecurity: configureWindow,
    loadRenderer: (window, mode) => {
      const targetUrl = withWindowMode(rendererTargetUrl, mode);
      if (rendererUrl) {
        void window.loadURL(targetUrl);
      } else {
        void window.loadURL(targetUrl);
      }
    },
    rendererUrl: rendererTargetUrl,
    rendererFile,
    preloadPath: join(__dirname, '../preload/index.js'),
    onMainWindowCreated: (window) => windowFocusController.setWindow(window),
    onMainWindowClosed: () => windowFocusController.setWindow(null),
    getRendererTargetUrl: (mode) => withWindowMode(rendererTargetUrl, mode),
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
    const rendererFile = join(__dirname, '../renderer/index.html');
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    const rendererTargetUrl = rendererUrl ?? pathToFileURL(rendererFile).href;
    try {
      const database = createDatabase(join(app.getPath('userData'), 'pw-tool.sqlite3'));
      const repository = new SessionRepository(database);
      windowManager = createElectronWindowManager(windowFocusController, repository);
      const session = new SessionService(repository);
      const history = new HistoryService(repository);
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
        history: {
          list: (input) => history.list(input),
          delete: (id) => history.delete(id),
          editSegments: (input) => history.editSegments(input),
          exportCsv: (input) => exportService.exportCsv(input),
        },
        settings,
        window: {
          showMain: () => windowManager?.showMainWindow(),
          showMini: () => windowManager?.showMiniWindow(),
          setAlwaysOnTop: (value) => windowManager?.setMiniAlwaysOnTop(value) ?? false,
        },
        snapshotTargets: () => windowManager?.getSnapshotTargets() ?? [],
      });
      const destroyTray = createApplication(windowManager);
      registerAppBeforeQuitCleanup({ app, windowManager, registration, destroyTray, database });
      app.on('activate', () => windowManager?.showMainWindow());
    } catch {
      createStartupErrorWindow(rendererTargetUrl);
    }
  });
}
