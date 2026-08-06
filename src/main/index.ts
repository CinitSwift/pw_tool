import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  configureWindowSecurity,
  createMainWindowOptions,
  createWindowFocusController,
} from './window-policy';

let mainWindow: BrowserWindow | null = null;
const windowFocusController = createWindowFocusController();

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => windowFocusController.requestFocus());

  const createMainWindow = (): void => {
    mainWindow = new BrowserWindow(
      createMainWindowOptions(join(__dirname, '../preload/index.js')),
    );
    windowFocusController.setWindow(mainWindow);

    const rendererFile = join(__dirname, '../renderer/index.html');
    const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(rendererFile).href;
    configureWindowSecurity(mainWindow.webContents, rendererUrl);

    if (process.env.ELECTRON_RENDERER_URL) {
      void mainWindow.loadURL(rendererUrl);
    } else {
      void mainWindow.loadFile(rendererFile);
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
      windowFocusController.setWindow(null);
    });
  };

  app.whenReady().then(() => {
    createMainWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
