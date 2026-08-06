export interface MainWindowLike {
  isMinimized(): boolean;
  restore(): void;
  focus(): void;
}

interface WebContentsLike {
  on(event: 'will-navigate', handler: (event: { preventDefault(): void }, url: string) => void): void;
  setWindowOpenHandler(handler: () => { action: 'deny' }): void;
}

function isAllowedNavigation(targetUrl: string, rendererUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    const renderer = new URL(rendererUrl);

    if (renderer.protocol === 'file:') {
      return target.protocol === 'file:' && target.pathname === renderer.pathname;
    }

    return target.origin === renderer.origin;
  } catch {
    return false;
  }
}

export function configureWindowSecurity(webContents: WebContentsLike, rendererUrl: string): void {
  webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, rendererUrl)) {
      event.preventDefault();
    }
  });
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

export function createMainWindowOptions(preloadPath: string) {
  return {
    width: 720,
    height: 620,
    minWidth: 680,
    minHeight: 560,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

export function createWindowFocusController() {
  let window: MainWindowLike | null = null;
  let pendingFocus = false;

  const focusWindow = (): void => {
    if (!window) {
      pendingFocus = true;
      return;
    }

    if (window.isMinimized()) {
      window.restore();
    }
    window.focus();
    pendingFocus = false;
  };

  return {
    requestFocus: focusWindow,
    setWindow(nextWindow: MainWindowLike | null): void {
      window = nextWindow;
      if (window && pendingFocus) {
        focusWindow();
      }
    },
  };
}
