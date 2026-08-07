import type { IpcRegistration } from './ipc/register-ipc';
import type { WindowManager } from './windows/main-window';

interface BeforeQuitAppLike {
  once(event: 'before-quit', handler: () => void): void;
}

interface CloseableDatabaseLike {
  close(): void;
}

export interface AppBeforeQuitCleanupDependencies {
  app: BeforeQuitAppLike;
  windowManager: WindowManager;
  registration: IpcRegistration;
  destroyTray(): void;
  database: CloseableDatabaseLike;
}

export function registerAppBeforeQuitCleanup(dependencies: AppBeforeQuitCleanupDependencies): void {
  dependencies.app.once('before-quit', () => {
    dependencies.windowManager.setQuitting(true);
    dependencies.registration.unregister();
    dependencies.destroyTray();
    dependencies.database.close();
  });
}
