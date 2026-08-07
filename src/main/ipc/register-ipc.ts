import type { Session } from '../../shared/domain/session-machine';
import type {
  AppSettings,
  BillingSettings,
  HistoryQuery,
  RecoveryChoice,
  RecoveryResult,
  SessionSnapshot,
  TimeSegment,
} from '../../shared/domain/types';
import { IPC } from './channels';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

interface IpcMainLike {
  handle(channel: string, handler: Handler): void;
  removeHandler(channel: string): void;
}

interface SnapshotTarget {
  send(channel: string, snapshot: SessionSnapshot): void;
}

interface SessionActions {
  getSnapshot(): SessionSnapshot | Promise<SessionSnapshot>;
  start(): SessionSnapshot | Promise<SessionSnapshot>;
  pause(): SessionSnapshot | Promise<SessionSnapshot>;
  resume(): SessionSnapshot | Promise<SessionSnapshot>;
  complete(): SessionSnapshot | Promise<SessionSnapshot>;
  updateSettings(settings: BillingSettings): SessionSnapshot | Promise<SessionSnapshot>;
  updateNote(note: string): SessionSnapshot | Promise<SessionSnapshot>;
  editSegments(segments: TimeSegment[]): SessionSnapshot | Promise<SessionSnapshot>;
  handleRecovery(choice: RecoveryChoice): RecoveryResult | Promise<RecoveryResult>;
}

interface HistoryActions {
  list(input: HistoryQuery): Session[] | Promise<Session[]>;
  delete(id: string): void | Promise<void>;
  exportCsv(input: HistoryQuery): { filePath: string; rowCount: number } | Promise<{ filePath: string; rowCount: number }>;
}

interface SettingsActions {
  get(): AppSettings | Promise<AppSettings>;
  save(settings: AppSettings): AppSettings | Promise<AppSettings>;
}

interface WindowActions {
  showMain(): void | Promise<void>;
  showMini(): void | Promise<void>;
  setAlwaysOnTop(value: boolean): boolean | Promise<boolean>;
}

export interface IpcDependencies {
  ipcMain: IpcMainLike;
  session: SessionActions;
  history: HistoryActions;
  settings: SettingsActions;
  window: WindowActions;
  snapshotTargets?: () => SnapshotTarget[];
}

export interface IpcRegistration {
  (): void;
  unregister(): void;
  broadcastSnapshot(snapshot: SessionSnapshot): void;
}

export function registerIpc(dependencies: IpcDependencies): IpcRegistration {
  const { ipcMain, session, history, settings, window } = dependencies;
  const handlers: Record<(typeof IPC)[keyof typeof IPC], Handler> = {
    [IPC.sessionSnapshot]: () => session.getSnapshot(),
    [IPC.sessionStart]: () => session.start(),
    [IPC.sessionPause]: () => session.pause(),
    [IPC.sessionResume]: () => session.resume(),
    [IPC.sessionComplete]: () => session.complete(),
    [IPC.sessionUpdateSettings]: (_event, value) => session.updateSettings(value as BillingSettings),
    [IPC.sessionUpdateNote]: (_event, value) => session.updateNote(value as string),
    [IPC.sessionEditSegments]: (_event, value) => session.editSegments(value as TimeSegment[]),
    [IPC.sessionRecovery]: (_event, value) => session.handleRecovery(value as RecoveryChoice),
    [IPC.historyList]: (_event, value) => history.list(value as HistoryQuery),
    [IPC.historyDelete]: (_event, value) => history.delete(value as string),
    [IPC.historyExportCsv]: (_event, value) => history.exportCsv(value as HistoryQuery),
    [IPC.settingsGet]: () => settings.get(),
    [IPC.settingsSave]: (_event, value) => settings.save(value as AppSettings),
    [IPC.windowShowMain]: () => window.showMain(),
    [IPC.windowShowMini]: () => window.showMini(),
    [IPC.windowSetAlwaysOnTop]: (_event, value) => window.setAlwaysOnTop(value as boolean),
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (event, ...args) => handler(event, ...args));
  }

  const unregister = (): void => {
    for (const channel of Object.values(IPC)) {
      ipcMain.removeHandler(channel);
    }
  };
  const registration = unregister as IpcRegistration;
  registration.unregister = unregister;
  registration.broadcastSnapshot = (snapshot): void => {
    for (const target of dependencies.snapshotTargets?.() ?? []) {
      target.send(IPC.sessionSnapshot, snapshot);
    }
  };
  return registration;
}
