import type { BrowserWindowLike } from './main-window';

export const MINI_WINDOW_DEFAULTS = {
  width: 280,
  height: 160,
  minWidth: 260,
  minHeight: 140,
  frame: false,
  resizable: false,
  show: false,
} as const;

export function createMiniWindowOptions(preloadPath: string) {
  return {
    ...MINI_WINDOW_DEFAULTS,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

export function applyMiniAlwaysOnTop(window: BrowserWindowLike, value: boolean): boolean {
  window.setAlwaysOnTop(value);
  return value;
}
