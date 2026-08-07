import { describe, expect, it, vi } from 'vitest';
import {
  MAIN_WINDOW_DEFAULTS,
  createMainWindowOptions,
  isWindowBoundsVisible,
  type WindowBounds,
} from '../../../src/main/windows/main-window';
import {
  MINI_WINDOW_DEFAULTS,
  createMiniWindowOptions,
} from '../../../src/main/windows/mini-window';
import { createTrayController, createTrayMenuTemplate } from '../../../src/main/tray';
import { registerAppBeforeQuitCleanup } from '../../../src/main/app-lifecycle';
import { createDatabase } from '../../../src/main/db/database';
import { SessionRepository } from '../../../src/main/db/repositories';
import {
  acquireSingleInstance,
  createWindowManager,
  type BrowserWindowLike,
  type WindowManagerDependencies,
} from '../../../src/main/windows/main-window';

function createWindow(overrides: Partial<BrowserWindowLike> = {}): BrowserWindowLike {
  return {
    on: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    destroy: vi.fn(),
    close: vi.fn(),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 720, height: 620 })),
    setAlwaysOnTop: vi.fn(),
    loadURL: vi.fn(async () => undefined),
    loadFile: vi.fn(async () => undefined),
    webContents: {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      send: vi.fn(),
      isDestroyed: vi.fn(() => false),
    },
    ...overrides,
  };
}

function createDependencies(overrides: Partial<WindowManagerDependencies> = {}) {
  const main = createWindow();
  const mini = createWindow();
  const settings = {
    billingMode: '15-step' as const,
    hourlyRateYuan: 40,
    hourlyCommissionYuan: 3,
    miniAlwaysOnTop: false,
  };
  const dependencies: WindowManagerDependencies = {
    createMainWindow: vi.fn(() => main),
    createMiniWindow: vi.fn(() => mini),
    getSettings: vi.fn(() => settings),
    saveSettings: vi.fn(),
    getScreenWorkAreas: vi.fn(() => [{ x: 0, y: 0, width: 1440, height: 900 }]),
    ...overrides,
  };
  return { dependencies, main, mini, settings };
}

describe('window manager', () => {
  it('uses the required secure main window dimensions', () => {
    expect(MAIN_WINDOW_DEFAULTS).toEqual({ width: 720, height: 620, minWidth: 680, minHeight: 560 });
    expect(createMainWindowOptions('/preload.js')).toMatchObject({
      ...MAIN_WINDOW_DEFAULTS,
      webPreferences: { preload: '/preload.js', contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
  });

  it('uses a frameless non-resizable mini window', () => {
    expect(MINI_WINDOW_DEFAULTS).toEqual({
      width: 280,
      height: 160,
      minWidth: 260,
      minHeight: 140,
      frame: false,
      resizable: false,
      show: false,
    });
    expect(createMiniWindowOptions('/preload.js')).toMatchObject({
      ...MINI_WINDOW_DEFAULTS,
      webPreferences: { preload: '/preload.js', contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
  });

  it('hides the main window on close and only closes when quitting', () => {
    const { dependencies, main } = createDependencies();
    const manager = createWindowManager(dependencies);
    manager.createMainWindow();
    const closeHandler = vi.mocked(main.on).mock.calls.find(([event]) => event === 'close')?.[1] as
      ((event: { preventDefault(): void }) => void);
    const event = { preventDefault: vi.fn() };

    closeHandler(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(main.hide).toHaveBeenCalledOnce();
    expect(main.close).not.toHaveBeenCalled();

    manager.setQuitting(true);
    const quittingEvent = { preventDefault: vi.fn() };
    closeHandler(quittingEvent);
    expect(quittingEvent.preventDefault).not.toHaveBeenCalled();
    expect(main.hide).toHaveBeenCalledOnce();
  });

  it('persists main window bounds after moves and resizes', () => {
    const { dependencies, main } = createDependencies();
    const manager = createWindowManager(dependencies);
    manager.createMainWindow();
    const moveHandler = vi.mocked(main.on).mock.calls.find(([event]) => event === 'move')?.[1] as () => void;
    const resizeHandler = vi.mocked(main.on).mock.calls.find(([event]) => event === 'resize')?.[1] as () => void;

    moveHandler();
    resizeHandler();

    expect(dependencies.saveSettings).toHaveBeenCalledTimes(2);
    expect(dependencies.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      mainWindowBounds: { x: 100, y: 100, width: 720, height: 620 },
    }));
  });

  it('switches between main and mini windows without creating another timer state', () => {
    const { dependencies, main, mini } = createDependencies();
    const manager = createWindowManager(dependencies);

    manager.createMainWindow();
    manager.showMiniWindow();
    expect(main.hide).toHaveBeenCalledOnce();
    expect(mini.show).toHaveBeenCalledOnce();
    expect(mini.focus).toHaveBeenCalledOnce();

    manager.showMainWindow();
    expect(mini.hide).toHaveBeenCalledOnce();
    expect(main.show).toHaveBeenCalledOnce();
    expect(main.focus).toHaveBeenCalledOnce();
    expect(dependencies.createMainWindow).toHaveBeenCalledOnce();
    expect(dependencies.createMiniWindow).toHaveBeenCalledOnce();
  });

  it('restores and persists mini always-on-top state', () => {
    const { dependencies, mini, settings } = createDependencies({
      getSettings: vi.fn(() => ({
        billingMode: '15-step' as const,
        hourlyRateYuan: 40,
        hourlyCommissionYuan: 3,
        miniAlwaysOnTop: true,
      })),
    });
    const manager = createWindowManager(dependencies);
    manager.createMiniWindow();

    expect(mini.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(settings.miniAlwaysOnTop).toBe(false);

    expect(manager.setMiniAlwaysOnTop(false)).toBe(false);
    expect(mini.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(dependencies.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ miniAlwaysOnTop: false }));
  });

  it('loads and saves window settings through the SQLite app_settings repository', () => {
    const db = createDatabase(':memory:');
    const repository = new SessionRepository(db);
    repository.saveSettings({
      billingMode: '15-step',
      hourlyRateYuan: 40,
      hourlyCommissionYuan: 3,
      miniAlwaysOnTop: true,
      mainWindowBounds: { x: 80, y: 90, width: 720, height: 620 },
    });
    const main = createWindow({ getBounds: vi.fn(() => ({ x: 120, y: 130, width: 720, height: 620 })) });
    const mini = createWindow();
    const manager = createWindowManager({
      createMainWindow: vi.fn(() => main),
      createMiniWindow: vi.fn(() => mini),
      getSettings: () => repository.getSettings(),
      saveSettings: (settings) => repository.saveSettings(settings),
      getScreenWorkAreas: () => [{ x: 0, y: 0, width: 1440, height: 900 }],
    });

    manager.createMainWindow();
    manager.createMiniWindow();
    expect(mini.setAlwaysOnTop).toHaveBeenCalledWith(true);

    const moveHandler = vi.mocked(main.on).mock.calls.find(([event]) => event === 'move')?.[1] as () => void;
    moveHandler();
    manager.setMiniAlwaysOnTop(false);

    expect(repository.getSettings()).toMatchObject({
      miniAlwaysOnTop: false,
      mainWindowBounds: { x: 120, y: 130, width: 720, height: 620 },
    });
    db.close();
  });

  it('returns snapshot targets only for live main and mini windows', () => {
    const main = createWindow();
    const mini = createWindow();
    const { dependencies } = createDependencies({
      createMainWindow: vi.fn(() => main),
      createMiniWindow: vi.fn(() => mini),
    });
    const manager = createWindowManager(dependencies);

    manager.createMainWindow();
    manager.createMiniWindow();
    expect(manager.getSnapshotTargets()).toEqual([main.webContents, mini.webContents]);

    vi.mocked(main.isDestroyed).mockReturnValue(true);
    expect(manager.getSnapshotTargets()).toEqual([mini.webContents]);

    vi.mocked(mini.webContents.isDestroyed).mockReturnValue(true);
    expect(manager.getSnapshotTargets()).toEqual([]);
  });

  it('falls back to centered bounds when saved bounds are not visible', () => {
    const invalidBounds: WindowBounds = { x: 3000, y: 3000, width: 720, height: 620 };
    const { dependencies } = createDependencies({
      getSettings: vi.fn(() => ({
        billingMode: '15-step' as const,
        hourlyRateYuan: 40,
        hourlyCommissionYuan: 3,
        miniAlwaysOnTop: false,
        mainWindowBounds: invalidBounds,
      })),
    });
    const manager = createWindowManager(dependencies);

    manager.createMainWindow();

    expect(dependencies.createMainWindow).toHaveBeenCalledWith(expect.objectContaining({ x: 360, y: 140 }));
    expect(isWindowBoundsVisible(invalidBounds, [{ x: 0, y: 0, width: 1440, height: 900 }])).toBe(false);
  });

  it('rejects malformed saved bounds before checking display visibility', () => {
    expect(isWindowBoundsVisible({ x: 0, y: 0, width: 0, height: 620 }, [{ x: 0, y: 0, width: 1440, height: 900 }])).toBe(false);
    expect(isWindowBoundsVisible({ x: '0' as unknown as number, y: 0, width: 720, height: 620 }, [{ x: 0, y: 0, width: 1440, height: 900 }])).toBe(false);
  });

  it('recreates a destroyed main window and restores the mini state', () => {
    const first = createWindow({ isDestroyed: vi.fn(() => true) });
    const second = createWindow();
    const loadRenderer = vi.fn();
    const { dependencies } = createDependencies({
      createMainWindow: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
      loadRenderer,
    });
    const manager = createWindowManager(dependencies);

    manager.createMainWindow();
    manager.showMainWindow();

    expect(dependencies.createMainWindow).toHaveBeenCalledTimes(2);
    expect(loadRenderer).toHaveBeenCalledTimes(2);
    expect(second.show).toHaveBeenCalledOnce();
  });

  it('focuses the recovery dialog before the main window on a second instance', () => {
    const focusRecovery = vi.fn();
    const { dependencies, main } = createDependencies({ focusRecovery });
    const manager = createWindowManager(dependencies);
    manager.setRecoveryDialogOpen(true);
    manager.focusExistingWindow();

    expect(focusRecovery).toHaveBeenCalledOnce();
    expect(main.focus).not.toHaveBeenCalled();

    manager.setRecoveryDialogOpen(false);
    manager.focusExistingWindow();
    expect(main.focus).toHaveBeenCalledOnce();
  });

  it('marks the window manager as quitting before app-level quit cleanup', () => {
    const app = { once: vi.fn((_event: 'before-quit', handler: () => void) => handler) };
    const { dependencies, main } = createDependencies();
    const manager = createWindowManager(dependencies);
    manager.createMainWindow();
    const closeHandler = vi.mocked(main.on).mock.calls.find(([event]) => event === 'close')?.[1] as
      ((event: { preventDefault(): void }) => void);
    const registration = Object.assign(vi.fn(), {
      unregister: vi.fn(),
      broadcastSnapshot: vi.fn(),
    });
    const database = { close: vi.fn() };
    const destroyTray = vi.fn();

    registerAppBeforeQuitCleanup({
      app,
      windowManager: manager,
      registration,
      destroyTray,
      database,
    });

    const beforeQuitHandler = vi.mocked(app.once).mock.calls[0]?.[1] as (() => void) | undefined;
    expect(beforeQuitHandler).toBeTypeOf('function');

    const hideEventBeforeQuit = { preventDefault: vi.fn() };
    closeHandler(hideEventBeforeQuit);
    expect(hideEventBeforeQuit.preventDefault).toHaveBeenCalledOnce();
    expect(main.hide).toHaveBeenCalledOnce();

    beforeQuitHandler?.();

    const hideEventAfterQuit = { preventDefault: vi.fn() };
    closeHandler(hideEventAfterQuit);

    expect(manager.isQuitting()).toBe(true);
    expect(hideEventAfterQuit.preventDefault).not.toHaveBeenCalled();
    expect(main.hide).toHaveBeenCalledOnce();
    expect(registration.unregister).toHaveBeenCalledOnce();
    expect(destroyTray).toHaveBeenCalledOnce();
    expect(database.close).toHaveBeenCalledOnce();
  });
});

describe('tray menu', () => {
  it('contains the required labels and actions', () => {
    const showMain = vi.fn();
    const showMini = vi.fn();
    const quit = vi.fn();
    const template = createTrayMenuTemplate({ showMain, showMini, quit });

    expect(template.map((item) => item.label)).toEqual(['显示窗口', '显示迷你窗', '退出应用']);
    template[0].click?.();
    template[1].click?.();
    template[2].click?.();
    expect(showMain).toHaveBeenCalledOnce();
    expect(showMini).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
  });

  it('destroys the tray before quitting the application', () => {
    const calls: string[] = [];
    const tray = { destroy: vi.fn(() => calls.push('tray')), setContextMenu: vi.fn(), setToolTip: vi.fn(), on: vi.fn() };
    const controller = createTrayController({
      tray,
      setQuitting: vi.fn(() => calls.push('quitting')),
      quitApp: vi.fn(() => calls.push('app')),
    });

    controller.quit();

    expect(calls).toEqual(['quitting', 'tray', 'app']);
  });
});

describe('single instance', () => {
  it('quits without registering a second-instance handler when the lock fails', () => {
    const app = {
      requestSingleInstanceLock: vi.fn(() => false),
      on: vi.fn(),
      quit: vi.fn(),
    };

    expect(acquireSingleInstance(app, vi.fn())).toBe(false);
    expect(app.quit).toHaveBeenCalledOnce();
    expect(app.on).not.toHaveBeenCalled();
  });

  it('focuses the existing window when another instance starts', () => {
    const focusExisting = vi.fn();
    let secondInstance: (() => void) | undefined;
    const app = {
      requestSingleInstanceLock: vi.fn(() => true),
      on: vi.fn((_event: string, handler: () => void) => {
        secondInstance = handler;
      }),
      quit: vi.fn(),
    };

    expect(acquireSingleInstance(app, focusExisting)).toBe(true);
    secondInstance?.();
    expect(focusExisting).toHaveBeenCalledOnce();
    expect(app.quit).not.toHaveBeenCalled();
  });
});
