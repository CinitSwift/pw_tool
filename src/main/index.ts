import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { IPC } from './ipc/channels';
import { createTrayController, createTrayMenuTemplate, configureTray, type TrayLike } from './tray';
import { createWindowFocusController } from './window-policy';
import {
  acquireSingleInstance,
  configureWindow,
  createWindowManager,
  type BrowserWindowLike,
  type WindowManager,
} from './windows/main-window';
import type { AppSettings } from '../shared/domain/types';

const defaultSettings: AppSettings = {
  billingMode: '15-step',
  hourlyRateYuan: 40,
  hourlyCommissionYuan: 3,
  miniAlwaysOnTop: false,
};

function createSettingsStore(filename: string) {
  let settings = defaultSettings;
  try {
    settings = { ...defaultSettings, ...JSON.parse(readFileSync(filename, 'utf8')) } as AppSettings;
  } catch {
    // A missing or invalid UI settings file falls back to safe defaults.
  }
  return {
    get(): AppSettings {
      return { ...settings };
    },
    save(next: AppSettings): void {
      settings = { ...next };
      writeFileSync(filename, JSON.stringify(settings), 'utf8');
    },
  };
}

function createElectronWindowManager(windowFocusController: ReturnType<typeof createWindowFocusController>): WindowManager {
  const rendererFile = join(__dirname, '../renderer/index.html');
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const settingsStore = createSettingsStore(join(app.getPath('userData'), 'window-settings.json'));
  return createWindowManager({
    createMainWindow: (options) => new BrowserWindow(options) as unknown as BrowserWindowLike,
    createMiniWindow: (options) => new BrowserWindow(options) as unknown as BrowserWindowLike,
    getSettings: settingsStore.get,
    saveSettings: settingsStore.save,
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

function registerWindowIpc(windowManager: WindowManager): void {
  ipcMain.handle(IPC.windowShowMain, () => windowManager.showMainWindow());
  ipcMain.handle(IPC.windowShowMini, () => windowManager.showMiniWindow());
  ipcMain.handle(IPC.windowSetAlwaysOnTop, (_event, value: unknown) => {
    if (typeof value !== 'boolean') {
      throw new TypeError('always-on-top value must be boolean');
    }
    return windowManager.setMiniAlwaysOnTop(value);
  });
}

function createApplication(windowManager: WindowManager): void {
  let tray: TrayLike | null = null;
  const quitController = createTrayController({
    tray: {
      destroy: () => tray?.destroy(),
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
  registerWindowIpc(windowManager);
  windowManager.createMainWindow();
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
    windowManager = createElectronWindowManager(windowFocusController);
    createApplication(windowManager);
    app.on('activate', () => windowManager?.showMainWindow());
  });
}
