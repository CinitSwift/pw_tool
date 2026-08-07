export interface TrayMenuItem {
  label: string;
  click(): void;
}

export interface TrayLike {
  setContextMenu(menu: unknown): void;
  setToolTip(tooltip: string): void;
  on(event: 'click', handler: () => void): void;
  destroy(): void;
}

export interface TrayActions {
  showMain(): void;
  showMini(): void;
  quit(): void;
}

export interface TrayControllerDependencies {
  tray: TrayLike;
  setQuitting(value: boolean): void;
  quitApp(): void;
}

export function createTrayMenuTemplate(actions: TrayActions): TrayMenuItem[] {
  return [
    { label: '显示窗口', click: actions.showMain },
    { label: '显示迷你窗', click: actions.showMini },
    { label: '退出应用', click: actions.quit },
  ];
}

export function configureTray(tray: TrayLike, menu: unknown, actions: TrayActions): void {
  tray.setToolTip('陪玩小工具');
  tray.setContextMenu(menu);
  tray.on('click', actions.showMain);
}

export function createTrayController(dependencies: TrayControllerDependencies) {
  return {
    quit(): void {
      dependencies.setQuitting(true);
      dependencies.tray.destroy();
      dependencies.quitApp();
    },
  };
}
