import { describe, expect, it, vi } from 'vitest';
import {
  configureWindowSecurity,
  createMainWindowOptions,
  createWindowFocusController,
} from '../../../src/main/window-policy';

describe('main window policy', () => {
  it('allows renderer navigation and denies new windows', () => {
    let navigateHandler: ((event: { preventDefault(): void }, url: string) => void) | undefined;
    let openHandler: (() => { action: 'deny' }) | undefined;
    const webContents = {
      on: vi.fn((_event, handler) => {
        navigateHandler = handler;
      }),
      setWindowOpenHandler: vi.fn((handler) => {
        openHandler = handler;
      }),
    };
    const preventAllowedNavigation = vi.fn();
    const preventExternalNavigation = vi.fn();

    configureWindowSecurity(webContents, 'http://localhost:5173');
    navigateHandler?.({ preventDefault: preventAllowedNavigation }, 'http://localhost:5173/settings');
    navigateHandler?.({ preventDefault: preventExternalNavigation }, 'https://example.com');

    expect(preventAllowedNavigation).not.toHaveBeenCalled();
    expect(preventExternalNavigation).toHaveBeenCalledOnce();
    expect(openHandler?.()).toEqual({ action: 'deny' });
  });

  it('allows only the current production renderer file', () => {
    let navigateHandler: ((event: { preventDefault(): void }, url: string) => void) | undefined;
    const webContents = {
      on: vi.fn((_event, handler) => {
        navigateHandler = handler;
      }),
      setWindowOpenHandler: vi.fn(),
    };
    const preventCurrentFile = vi.fn();
    const preventOtherFile = vi.fn();

    configureWindowSecurity(webContents, 'file:///app/out/renderer/index.html');
    navigateHandler?.(
      { preventDefault: preventCurrentFile },
      'file:///app/out/renderer/index.html#settings',
    );
    navigateHandler?.({ preventDefault: preventOtherFile }, 'file:///tmp/untrusted.html');

    expect(preventCurrentFile).not.toHaveBeenCalled();
    expect(preventOtherFile).toHaveBeenCalledOnce();
  });

  it('builds a secure main window configuration', () => {
    const options = createMainWindowOptions('/app/out/preload/index.js');

    expect(options.width).toBe(720);
    expect(options.height).toBe(620);
    expect(options.minWidth).toBe(680);
    expect(options.minHeight).toBe(560);
    expect(options.webPreferences).toMatchObject({
      preload: '/app/out/preload/index.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });

  it('focuses the window after a second instance arrives before creation', () => {
    const restore = vi.fn();
    const focus = vi.fn();
    const controller = createWindowFocusController();

    controller.requestFocus();
    controller.setWindow({ isMinimized: () => true, restore, focus });

    expect(restore).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });
});
