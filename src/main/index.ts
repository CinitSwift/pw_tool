import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

let mainWindow: BrowserWindow | null = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  const createMainWindow = (): void => {
    mainWindow = new BrowserWindow({
      width: 720,
      height: 620,
      minWidth: 680,
      minHeight: 560,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
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
