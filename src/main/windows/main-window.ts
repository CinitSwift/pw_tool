import type { AppSettings } from '../../shared/domain/types';
import { configureWindowSecurity } from '../window-policy';
import { applyMiniAlwaysOnTop, createMiniWindowOptions } from './mini-window';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowWorkArea extends WindowBounds {}

export interface WebContentsLike {
  on(event: 'will-navigate', handler: (event: { preventDefault(): void }, url: string) => void): void;
  setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  send(channel: string, ...args: unknown[]): void;
  isDestroyed(): boolean;
}

export interface BrowserWindowLike {
  on(event: string, handler: (...args: any[]) => void): void;
  once(event: string, handler: (...args: any[]) => void): void;
  show(): void;
  hide(): void;
  focus(): void;
  destroy(): void;
  close(): void;
  isMinimized(): boolean;
  restore(): void;
  isDestroyed(): boolean;
  getBounds(): WindowBounds;
  setAlwaysOnTop(value: boolean): void;
  loadURL(url: string): Promise<unknown>;
  loadFile(file: string): Promise<unknown>;
  webContents: WebContentsLike;
}

export interface WindowCreateOptions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  x?: number;
  y?: number;
  frame?: boolean;
  resizable?: boolean;
  show?: boolean;
  webPreferences: {
    preload: string;
    contextIsolation: true;
    nodeIntegration: false;
    sandbox: true;
  };
}

export const MAIN_WINDOW_DEFAULTS = {
  width: 720,
  height: 620,
  minWidth: 680,
  minHeight: 560,
} as const;

export function createMainWindowOptions(preloadPath: string, bounds?: Partial<WindowBounds>): WindowCreateOptions {
  return {
    ...MAIN_WINDOW_DEFAULTS,
    ...(bounds?.x === undefined ? {} : { x: bounds.x }),
    ...(bounds?.y === undefined ? {} : { y: bounds.y }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

function overlaps(left: WindowBounds, right: WindowBounds): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function isValidBounds(bounds: WindowBounds | undefined): bounds is WindowBounds {
  return bounds !== undefined
    && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.width > 0
    && bounds.height > 0;
}

export function isWindowBoundsVisible(bounds: WindowBounds | undefined, workAreas: WindowWorkArea[]): boolean {
  return isValidBounds(bounds) && workAreas.some((workArea) => isValidBounds(workArea) && overlaps(bounds, workArea));
}

export function centeredWindowBounds(workArea: WindowWorkArea): WindowBounds {
  return {
    x: Math.round(workArea.x + (workArea.width - MAIN_WINDOW_DEFAULTS.width) / 2),
    y: Math.round(workArea.y + (workArea.height - MAIN_WINDOW_DEFAULTS.height) / 2),
    width: MAIN_WINDOW_DEFAULTS.width,
    height: MAIN_WINDOW_DEFAULTS.height,
  };
}

export interface WindowManagerDependencies {
  createMainWindow(options: WindowCreateOptions): BrowserWindowLike;
  createMiniWindow(options: ReturnType<typeof createMiniWindowOptions>): BrowserWindowLike;
  getSettings(): AppSettings;
  saveSettings(settings: AppSettings): void;
  getScreenWorkAreas(): WindowWorkArea[];
  configureSecurity?: (window: BrowserWindowLike, rendererUrl: string) => void;
  loadRenderer?: (window: BrowserWindowLike, mode: 'main' | 'mini') => void;
  rendererUrl?: string;
  rendererFile?: string;
  preloadPath?: string;
  focusRecovery?: () => void;
  onMainWindowCreated?: (window: BrowserWindowLike) => void;
  onMainWindowClosed?: () => void;
  getRendererTargetUrl?(mode: 'main' | 'mini'): string;
}

export interface WindowManager {
  createMainWindow(): BrowserWindowLike;
  createMiniWindow(): BrowserWindowLike;
  showMainWindow(): void;
  showMiniWindow(): void;
  setMiniAlwaysOnTop(value: boolean): boolean;
  focusExistingWindow(): void;
  setRecoveryDialogOpen(value: boolean): void;
  setQuitting(value: boolean): void;
  isQuitting(): boolean;
  getMainWindow(): BrowserWindowLike | null;
  getMiniWindow(): BrowserWindowLike | null;
  getSnapshotTargets(): WebContentsLike[];
}

export interface SingleInstanceAppLike {
  requestSingleInstanceLock(): boolean;
  on(event: 'second-instance', handler: () => void): void;
  quit(): void;
}

export function acquireSingleInstance(app: SingleInstanceAppLike, focusExisting: () => void): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', focusExisting);
  return true;
}

export function createWindowManager(dependencies: WindowManagerDependencies): WindowManager {
  let mainWindow: BrowserWindowLike | null = null;
  let miniWindow: BrowserWindowLike | null = null;
  let quitting = false;
  let recoveryDialogOpen = false;

  const saveMainBounds = (window: BrowserWindowLike): void => {
    const settings = dependencies.getSettings();
    dependencies.saveSettings({ ...settings, mainWindowBounds: window.getBounds() });
  };

  const targetUrlFor = (mode: 'main' | 'mini'): string | undefined => {
    return dependencies.getRendererTargetUrl?.(mode) ?? dependencies.rendererUrl ?? dependencies.rendererFile;
  };

  const loadWindow = (window: BrowserWindowLike, mode: 'main' | 'mini'): void => {
    const targetUrl = targetUrlFor(mode);
    if (targetUrl) {
      dependencies.configureSecurity?.(window, targetUrl);
    }
    if (dependencies.loadRenderer) {
      dependencies.loadRenderer(window, mode);
      return;
    }
    if (dependencies.rendererUrl) {
      void window.loadURL(dependencies.rendererUrl);
      return;
    }
    if (dependencies.rendererFile) {
      void window.loadFile(dependencies.rendererFile);
    }
  };

  const attachMainWindow = (window: BrowserWindowLike): void => {
    window.on('close', (event: { preventDefault(): void }) => {
      if (!quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    window.on('move', () => saveMainBounds(window));
    window.on('resize', () => saveMainBounds(window));
    window.once('closed', () => {
      if (mainWindow === window) {
        mainWindow = null;
      }
      if (!quitting) {
        dependencies.onMainWindowClosed?.();
      }
    });
  };

  const ensureMainWindow = (): BrowserWindowLike => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow;
    }

    const settings = dependencies.getSettings();
    const savedBounds = settings.mainWindowBounds;
    const workAreas = dependencies.getScreenWorkAreas();
    const bounds = isWindowBoundsVisible(savedBounds, workAreas)
      ? savedBounds
      : centeredWindowBounds(workAreas[0] ?? { x: 0, y: 0, width: 1440, height: 900 });

    mainWindow = dependencies.createMainWindow(createMainWindowOptions(dependencies.preloadPath ?? '', bounds));
    attachMainWindow(mainWindow);
    loadWindow(mainWindow, 'main');
    dependencies.onMainWindowCreated?.(mainWindow);
    return mainWindow;
  };

  const ensureMiniWindow = (): BrowserWindowLike => {
    if (miniWindow && !miniWindow.isDestroyed()) {
      return miniWindow;
    }
    miniWindow = dependencies.createMiniWindow(createMiniWindowOptions(dependencies.preloadPath ?? ''));
    const createdMiniWindow = miniWindow;
    miniWindow.once('closed', () => {
      if (miniWindow === createdMiniWindow) {
        miniWindow = null;
      }
    });
    applyMiniAlwaysOnTop(miniWindow, dependencies.getSettings().miniAlwaysOnTop);
    loadWindow(miniWindow, 'mini');
    return miniWindow;
  };

  return {
    createMainWindow: ensureMainWindow,
    createMiniWindow: ensureMiniWindow,
    showMainWindow(): void {
      const main = ensureMainWindow();
      miniWindow?.hide();
      if (main.isMinimized()) {
        main.restore();
      }
      main.show();
      main.focus();
    },
    showMiniWindow(): void {
      const mini = ensureMiniWindow();
      mainWindow?.hide();
      mini.show();
      mini.focus();
    },
    setMiniAlwaysOnTop(value: boolean): boolean {
      const mini = ensureMiniWindow();
      applyMiniAlwaysOnTop(mini, value);
      dependencies.saveSettings({ ...dependencies.getSettings(), miniAlwaysOnTop: value });
      return value;
    },
    focusExistingWindow(): void {
      if (recoveryDialogOpen) {
        dependencies.focusRecovery?.();
        return;
      }
      const main = ensureMainWindow();
      if (main.isMinimized()) {
        main.restore();
      }
      main.show();
      main.focus();
    },
    setRecoveryDialogOpen(value: boolean): void {
      recoveryDialogOpen = value;
    },
    setQuitting(value: boolean): void {
      quitting = value;
    },
    isQuitting: () => quitting,
    getMainWindow: () => mainWindow,
    getMiniWindow: () => miniWindow,
    getSnapshotTargets: () => [mainWindow, miniWindow]
      .filter((window): window is BrowserWindowLike => window !== null && !window.isDestroyed())
      .map((window) => window.webContents)
      .filter((webContents) => !webContents.isDestroyed()),
  };
}

export function configureWindow(window: BrowserWindowLike, rendererUrl: string): void {
  configureWindowSecurity(window.webContents, rendererUrl);
}
